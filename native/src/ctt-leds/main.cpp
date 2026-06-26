// ctt-leds — drive the status LEDs (GPS / diag-A / diag-B) from a desired-state
// file. The decision logic (GPS fix, internet/ppp, alive heartbeat) stays in the
// Node app, which writes the file; this daemon owns the actuation + blink timing
// — replacing the in-process SetState() the Node app used to do.
//
// Two hardware backends, chosen at startup by what the board presents:
//   V3 — SX1509B I2C expander (GPS = bank A bit 0; A = bank B bit 2 / pin 10;
//        B = bank B bit 3 / pin 11). Read-modify-write keeps other pins intact.
//   V2 — plain GPIO LEDs exposed by the kernel gpio-led overlay at
//        /sys/class/leds/ctt-led-{gps,a,b} (see system/scripts/leds-overlay.sh);
//        we write brightness 0/1. There is no I2C LED expander on V2.
// If neither is present the daemon idles.
//
// Desired-state file /run/ctt/leds (key=value, one per line):
//   gps=on|off|blink|blink:<ms>
//   a=...
//   b=...
// A set data bit / brightness 1 lights the LED on both backends.
//
// Flags: --version.

#include <cerrno>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include <sys/stat.h>
#include <unistd.h>

#include "chips/sx1509b.h"

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

namespace {

volatile std::sig_atomic_t g_stop = 0;
void onSignal(int) { g_stop = 1; }

constexpr const char *kStateFile = "/run/ctt/leds";
constexpr int kTickMs = 50;
constexpr int kDefaultBlinkMs = 1000;

// LED -> expander pin (V3). GPS = bank A bit 0; A = bank B bit 2 (pin 10);
// B = bank B bit 3 (pin 11).
struct Desired {
  std::string gps = "off";
  std::string a = "off";
  std::string b = "off";
};

Desired readDesired() {
  Desired d;
  FILE *f = std::fopen(kStateFile, "r");
  if (!f)
    return d;
  char line[128];
  while (std::fgets(line, sizeof(line), f)) {
    char key[32], val[64];
    if (std::sscanf(line, " %31[^=]=%63s", key, val) == 2) {
      std::string k(key), v(val);
      if (k == "gps")
        d.gps = v;
      else if (k == "a")
        d.a = v;
      else if (k == "b")
        d.b = v;
    }
  }
  std::fclose(f);
  return d;
}

int blinkMs(const std::string &state) {
  if (state.rfind("blink:", 0) == 0) {
    int ms = std::atoi(state.c_str() + 6);
    if (ms > 0)
      return ms;
  }
  return kDefaultBlinkMs;
}

// Desired bit (lit?) for a state given elapsed time (for the blink square wave).
bool ledOn(const std::string &state, unsigned long long elapsed_ms) {
  if (state == "on")
    return true;
  if (state == "off")
    return false;
  if (state.rfind("blink", 0) == 0)
    return (elapsed_ms / blinkMs(state)) % 2 == 1;
  return false;
}

// V2 backend: gpio-led brightness nodes, created by the gpio-led overlay
// (system/scripts/leds-overlay.sh). Present only on a V2 board.
constexpr const char *kSysfsGps = "/sys/class/leds/ctt-led-gps/brightness";
constexpr const char *kSysfsA = "/sys/class/leds/ctt-led-a/brightness";
constexpr const char *kSysfsB = "/sys/class/leds/ctt-led-b/brightness";

bool sysfsLedsPresent() {
  return ::access(kSysfsGps, W_OK) == 0 && ::access(kSysfsA, W_OK) == 0 &&
         ::access(kSysfsB, W_OK) == 0;
}

void writeSysfsLed(const char *path, bool on) {
  FILE *f = std::fopen(path, "w");
  if (!f)
    return;
  std::fputc(on ? '1' : '0', f);
  std::fclose(f);
}

} // namespace

int main(int argc, char **argv) {
  for (int i = 1; i < argc; ++i) {
    if (std::string(argv[i]) == "--version") {
      std::puts(CTT_VERSION);
      return 0;
    }
  }
  std::signal(SIGINT, onSignal);
  std::signal(SIGTERM, onSignal);

  try {
    ctthw::I2cBus bus;
    ctthw::Sx1509b expander(bus);
    const bool use_expander = expander.present();
    const bool use_sysfs = !use_expander && sysfsLedsPresent();

    if (!use_expander && !use_sysfs) {
      std::fprintf(stderr,
                   "ctt-leds: no SX1509B and no gpio-led nodes — idling\n");
      while (!g_stop)
        ::sleep(1);
      return 0;
    }
    std::fprintf(stderr, "ctt-leds: backend = %s\n",
                 use_expander ? "SX1509B (V3)" : "gpio-led sysfs (V2)");

    Desired desired;
    // Full nanosecond mtime so two state writes within one wall-clock second
    // are not collapsed (tmpfs gives nanosecond resolution).
    struct timespec last_mtime = {0, 0};
    int last_gps = -1, last_a = -1, last_b = -1; // force the first write
    unsigned long long elapsed_ms = 0;

    while (!g_stop) {
      struct stat st;
      if (::stat(kStateFile, &st) == 0 &&
          (st.st_mtim.tv_sec != last_mtime.tv_sec ||
           st.st_mtim.tv_nsec != last_mtime.tv_nsec)) {
        last_mtime = st.st_mtim;
        desired = readDesired();
      }

      int gps_on = ledOn(desired.gps, elapsed_ms) ? 1 : 0;
      int a_on = ledOn(desired.a, elapsed_ms) ? 1 : 0;
      int b_on = ledOn(desired.b, elapsed_ms) ? 1 : 0;

      if (gps_on != last_gps || a_on != last_a || b_on != last_b) {
        if (use_expander) {
          // read-modify-write so other output pins are undisturbed
          ctthw::BankData cur = expander.readData();
          ctthw::BankData next = cur;
          if (gps_on)
            next.a |= (1u << 0);
          else
            next.a &= ~(1u << 0);
          if (a_on)
            next.b |= (1u << 2);
          else
            next.b &= ~(1u << 2);
          if (b_on)
            next.b |= (1u << 3);
          else
            next.b &= ~(1u << 3);
          if (next.a != cur.a || next.b != cur.b)
            expander.writeData(next);
        } else {
          writeSysfsLed(kSysfsGps, gps_on);
          writeSysfsLed(kSysfsA, a_on);
          writeSysfsLed(kSysfsB, b_on);
        }
        last_gps = gps_on;
        last_a = a_on;
        last_b = b_on;
      }

      ::usleep(kTickMs * 1000);
      elapsed_ms += kTickMs;
    }
    return 0;
  } catch (const std::exception &e) {
    std::fprintf(stderr, "ctt-leds: %s\n", e.what());
    return 1;
  }
}

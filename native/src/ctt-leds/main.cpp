// ctt-leds — drive the V3 status LEDs (GPS / diag-A / diag-B, on the SX1509B
// expander pins 0 / 10 / 11) from a desired-state file. The decision logic (GPS
// fix, internet/ppp, alive heartbeat) stays in the Node app, which writes the
// file; this daemon owns the I2C actuation, including blink timing — so it
// replaces the in-process SetState() the Node app did on V3.
//
// Desired-state file /run/ctt/leds (key=value, one per line):
//   gps=on|off|blink|blink:<ms>
//   a=...
//   b=...
// Polarity matches the Node SetState path: a set data bit lights the LED.
//
// V2 boards drive these LEDs over GPIO (no expander) — not handled here yet; on
// a V2 board this daemon idles.
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

    if (!expander.present()) {
      std::fprintf(stderr, "ctt-leds: no SX1509B (V2 board?) — LEDs are GPIO there; idling\n");
      while (!g_stop)
        ::sleep(1);
      return 0;
    }

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

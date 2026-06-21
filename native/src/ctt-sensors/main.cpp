// ctt-sensors — periodically read the station's analog I2C sensors (ADC rail
// voltages + board temperature) via ctthw and publish a snapshot to
// /run/ctt/sensors.json for the Node app to read. Replaces the in-process
// SensorMonitor that ran inside station-hardware-server (/sensor route).
//
// The JSON matches the old SensorMonitor shape so the Node side can read the
// file instead of polling I2C itself:
//   {"voltages":{"battery":"X.XX","solar":"Y.YY","rtc":-1},
//    "temperature":{"celsius":C,"fahrenheit":F},"recorded_at":"ISO8601"}
//
// Flags: --version, --once (read once, write, print, exit). Default: poll loop.

#include <cerrno>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <string>

#include <sys/stat.h>
#include <unistd.h>

#include "board/sensors.h"

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

namespace {

volatile std::sig_atomic_t g_stop = 0;
void onSignal(int) { g_stop = 1; }

// Board version: prefer /run/ctt/board.env (ctt-board-detect's authoritative
// runtime output, CTT_STATION_VERSION); fall back to the persistent
// /etc/ctt/station-revision, then to V3.
int readVersion() {
  FILE *f = std::fopen("/run/ctt/board.env", "r");
  if (f) {
    char line[160];
    while (std::fgets(line, sizeof(line), f)) {
      int v;
      if (std::sscanf(line, "CTT_STATION_VERSION=%d", &v) == 1) {
        std::fclose(f);
        return v;
      }
    }
    std::fclose(f);
  }
  f = std::fopen("/etc/ctt/station-revision", "r");
  if (!f)
    return 3; // default to V3
  int v = 3;
  if (std::fscanf(f, "%d", &v) != 1)
    v = 3;
  std::fclose(f);
  return v;
}

std::string nowIso() {
  std::time_t t = std::time(nullptr);
  std::tm tm{};
  gmtime_r(&t, &tm);
  char buf[32];
  std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
  return buf;
}

// Atomic publish: write to a temp file then rename over the destination so a
// reader never sees a half-written file.
void publish(const ctthw::SensorReading &s) {
  ::mkdir("/run/ctt", 0755);
  const char *tmp = "/run/ctt/sensors.json.tmp";
  const char *dst = "/run/ctt/sensors.json";
  FILE *f = std::fopen(tmp, "w");
  if (!f) {
    std::fprintf(stderr, "ctt-sensors: open %s: %s\n", tmp, std::strerror(errno));
    return;
  }
  std::fprintf(f,
               "{\"voltages\":{\"battery\":\"%.2f\",\"solar\":\"%.2f\",\"rtc\":-1},"
               "\"temperature\":{\"celsius\":%g,\"fahrenheit\":%g},"
               "\"recorded_at\":\"%s\"}\n",
               s.battery, s.solar, s.celsius, s.fahrenheit, nowIso().c_str());
  std::fclose(f);
  if (std::rename(tmp, dst) != 0)
    std::fprintf(stderr, "ctt-sensors: rename %s: %s\n", dst, std::strerror(errno));
}

} // namespace

int main(int argc, char **argv) {
  const int interval_s = 5;
  bool once = false;
  for (int i = 1; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "--version") {
      std::puts(CTT_VERSION);
      return 0;
    }
    if (a == "--once")
      once = true;
  }

  std::signal(SIGINT, onSignal);
  std::signal(SIGTERM, onSignal);

  const int version = readVersion();

  try {
    ctthw::I2cBus bus; // opened once, reused; flock serializes vs other processes
    do {
      try {
        ctthw::SensorReading s = ctthw::readSensors(bus, version);
        publish(s);
        std::fprintf(stderr, "ctt-sensors: batt=%.2f solar=%.2f temp=%.2fC\n",
                     s.battery, s.solar, s.celsius);
      } catch (const std::exception &e) {
        std::fprintf(stderr, "ctt-sensors: read error: %s\n", e.what());
      }
      if (once)
        break;
      for (int i = 0; i < interval_s && !g_stop; ++i)
        ::sleep(1);
    } while (!g_stop);
  } catch (const std::exception &e) {
    std::fprintf(stderr, "ctt-sensors: %s\n", e.what());
    return 1;
  }
  return 0;
}

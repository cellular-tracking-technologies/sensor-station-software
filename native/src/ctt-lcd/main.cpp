// ctt-lcd — render the station's status screen on the HD44780/PCF8574 character
// LCD (0x27 or 0x3f) from a desired-text file. The menu/stat/button logic stays
// in the Node station-lcd-interface, which writes the desired screen to
// /run/ctt/lcd; this daemon owns the I2C actuation, bringing the LCD under the
// same ctthw bus-lock discipline as the other native tools — it was the last
// I2C consumer still opening the bus from Node.
//
// Desired-screen file /run/ctt/lcd: up to <rows> lines of text separated by
// '\n'. Line N is shown on row N; each line is truncated to <cols>; rows with no
// line are left blank. Repainted whenever the file's mtime changes.
//
// The LCD is the same PCF8574 backpack on V2 and V3, so there is no board-version
// branch here; if no backpack is found the daemon idles.
//
// Flags: --version.

#include <csignal>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <fstream>
#include <string>
#include <vector>

#include <sys/stat.h>
#include <unistd.h>

#include "chips/lcd_pcf8574.h"

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

namespace {

volatile std::sig_atomic_t g_stop = 0;
void onSignal(int) { g_stop = 1; }

constexpr const char *kStateFile = "/run/ctt/lcd";
constexpr int kCols = 20;
constexpr int kRows = 4;
constexpr int kPollMs = 250;

// Read the desired screen: up to kRows lines from the state file.
std::vector<std::string> readFrame() {
  std::vector<std::string> lines;
  std::ifstream f(kStateFile);
  if (!f)
    return lines;
  std::string line;
  while (lines.size() < static_cast<std::size_t>(kRows) && std::getline(f, line)) {
    // Tolerate CRLF in case the file was written with carriage returns.
    if (!line.empty() && line.back() == '\r')
      line.pop_back();
    lines.push_back(line);
  }
  return lines;
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

    // Find the backpack (0x27 then 0x3f), matching the Node scan order.
    int addr = 0;
    for (int cand : {ctthw::LcdPcf8574::kAddrPrimary, ctthw::LcdPcf8574::kAddrAlt}) {
      ctthw::LcdPcf8574 probe(bus, cand, kCols, kRows);
      if (probe.present()) {
        addr = cand;
        break;
      }
    }
    if (addr == 0) {
      std::fprintf(stderr, "ctt-lcd: no PCF8574 LCD on the bus; idling\n");
      while (!g_stop)
        ::sleep(1);
      return 0;
    }

    ctthw::LcdPcf8574 lcd(bus, addr, kCols, kRows);
    lcd.initialize();

    time_t last_mtime = 0;
    bool painted = false;
    while (!g_stop) {
      struct stat st;
      if (::stat(kStateFile, &st) == 0 && (st.st_mtime != last_mtime || !painted)) {
        last_mtime = st.st_mtime;
        lcd.renderFrame(readFrame());
        painted = true;
      }
      ::usleep(kPollMs * 1000);
    }
    return 0;
  } catch (const std::exception &e) {
    std::fprintf(stderr, "ctt-lcd: %s\n", e.what());
    return 1;
  }
}

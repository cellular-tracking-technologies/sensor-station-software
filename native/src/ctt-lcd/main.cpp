// ctt-lcd — display server for the HD44780/PCF8574 character LCD (0x27/0x3f).
// Renders a framebuffer published by the Node station-lcd-interface to
// /run/ctt/lcd; the menu/stats/button logic stays in Node. Owns the I2C
// actuation under the shared ctthw bus lock — the LCD was the last I2C consumer
// still opening the bus from Node.
//
// Framebuffer file /run/ctt/lcd: a fixed 144-byte image —
//   bytes   0..63 : 8 CGRAM glyphs x 8 row-bytes (custom characters 0-7)
//   bytes 64..143 : 80 character cells, row-major (4 rows x 20 cols).
//                   Cell value = HD44780 code; 0-7 select a CGRAM glyph.
// Re-rendered when the file's mtime changes; only changed glyphs and changed
// rows are pushed to the controller (a glyph redefinition updates every on-
// screen instance without rewriting cells).
//
// The LCD is the same PCF8574 backpack on V2 and V3, so there is no board-
// version branch here; if no backpack is found the daemon idles.
//
// Flags: --version.

#include <csignal>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <fstream>
#include <string>

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
constexpr int kGlyphs = 8;
constexpr int kGlyphBytes = 8;
constexpr int kCells = kCols * kRows;                       // 80
constexpr int kFrameBytes = kGlyphs * kGlyphBytes + kCells; // 144
constexpr int kPollMs = 100;

struct Framebuffer {
  uint8_t glyph[kGlyphs][kGlyphBytes];
  uint8_t cell[kRows][kCols];
};

// Read the 144-byte framebuffer. Returns false if the file is missing or the
// wrong size — a partial/legacy write is ignored rather than rendered as garbage.
bool readFrame(Framebuffer &fb) {
  std::ifstream f(kStateFile, std::ios::binary);
  if (!f)
    return false;
  uint8_t buf[kFrameBytes];
  f.read(reinterpret_cast<char *>(buf), kFrameBytes);
  if (f.gcount() != static_cast<std::streamsize>(kFrameBytes))
    return false;
  std::memcpy(fb.glyph, buf, sizeof(fb.glyph));
  std::memcpy(fb.cell, buf + sizeof(fb.glyph), sizeof(fb.cell));
  return true;
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

    // Boot splash: shown from LCD bring-up until the Node app publishes its
    // first frame to /run/ctt/lcd. `primed` stays false below, so that first
    // frame does a full repaint over this.
    {
      static const char *splash[kRows] = {" CTT Sensor Station", "",
                                           "     Loading...", ""};
      for (int r = 0; r < kRows; ++r) {
        uint8_t row[kCols];
        std::memset(row, ' ', sizeof(row));
        for (int c = 0; c < kCols && splash[r][c]; ++c)
          row[c] = static_cast<uint8_t>(splash[r][c]);
        lcd.setCursor(0, r);
        lcd.writeCells(row, kCols);
      }
    }

    // Track what is currently on the controller so we only push diffs.
    Framebuffer shown;
    std::memset(&shown, 0, sizeof(shown));
    bool primed = false; // force a full paint (glyphs + all rows) on first frame
    // Full nanosecond mtime: comparing only whole seconds (st_mtime) would miss
    // a second frame written within the same wall-clock second (tmpfs gives
    // nanosecond resolution, and writers rename a fresh file each time).
    struct timespec last_mtime = {0, 0};

    while (!g_stop) {
      struct stat st;
      if (::stat(kStateFile, &st) == 0 &&
          (st.st_mtim.tv_sec != last_mtime.tv_sec ||
           st.st_mtim.tv_nsec != last_mtime.tv_nsec)) {
        Framebuffer want;
        if (readFrame(want)) {
          last_mtime = st.st_mtim;

          // Re-define only the glyphs that changed (CGRAM is undefined after
          // power-on, so the first frame defines all of them).
          for (int g = 0; g < kGlyphs; ++g) {
            if (!primed ||
                std::memcmp(want.glyph[g], shown.glyph[g], kGlyphBytes) != 0) {
              lcd.defineChar(g, want.glyph[g]);
              std::memcpy(shown.glyph[g], want.glyph[g], kGlyphBytes);
            }
          }
          // Re-write only the rows whose cells changed.
          for (int r = 0; r < kRows; ++r) {
            if (!primed || std::memcmp(want.cell[r], shown.cell[r], kCols) != 0) {
              lcd.setCursor(0, r);
              lcd.writeCells(want.cell[r], kCols);
              std::memcpy(shown.cell[r], want.cell[r], kCols);
            }
          }
          primed = true;
        }
      }
      ::usleep(kPollMs * 1000);
    }
    return 0;
  } catch (const std::exception &e) {
    std::fprintf(stderr, "ctt-lcd: %s\n", e.what());
    return 1;
  }
}

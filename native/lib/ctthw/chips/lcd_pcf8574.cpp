#include "chips/lcd_pcf8574.h"

#include <unistd.h>

namespace ctthw {

namespace {

constexpr uint8_t kEnable = 0x04; // E strobe

// LCD register-select modes (the RS bit).
constexpr uint8_t kModeCmd = 0x00;
constexpr uint8_t kModeChr = 0x01;

// HD44780 commands.
constexpr uint8_t kClearDisplay = 0x01;
constexpr uint8_t kEntryModeSet = 0x04;
constexpr uint8_t kDisplayControl = 0x08;
constexpr uint8_t kFunctionSet = 0x20;
constexpr uint8_t kSetCgramAddr = 0x40;
constexpr uint8_t kSetDdramAddr = 0x80;

// Command flags.
constexpr uint8_t kEntryLeft = 0x02;
constexpr uint8_t kDisplayOn = 0x04;
constexpr uint8_t k4BitMode = 0x00;
constexpr uint8_t k2Line = 0x08;

// DDRAM column-0 base address per row, matching the JS setCursor table.
constexpr uint8_t kRowBase[4] = {0x00, 0x40, 0x14, 0x54};

void sleepMs(int ms) { ::usleep(ms * 1000); }

} // namespace

bool LcdPcf8574::present() {
  // A bare port write of a benign state (backlight on, E low). ACK => present.
  return bus_.present(addr_, backlight_);
}

void LcdPcf8574::send(uint8_t value) { bus_.writeBytes(addr_, {value}); }

void LcdPcf8574::write4(int value, uint8_t mode) {
  uint8_t a = static_cast<uint8_t>(value & 0xF0); // upper nibble carries the data
  {
    // Keep the E high/low pulse atomic against other bus users.
    I2cBus::Lock lock(bus_);
    send(a | backlight_ | mode);
    send(a | kEnable | backlight_ | mode); // E high
    send(a | backlight_ | mode);           // E low -> latch
  }
  sleepMs(2);
}

void LcdPcf8574::writeByte(int value, uint8_t mode) {
  write4(value, mode);      // high nibble
  write4(value << 4, mode); // low nibble (shifted into the upper bits)
}

void LcdPcf8574::initialize() {
  // Canonical HD44780 "initialize by instruction" for 4-bit mode. Unlike the
  // original JS (which only re-syncs reliably from a cold / 8-bit power-on
  // state), this recovers from ANY state — essential for a daemon that may be
  // (re)started while the controller is already in 4-bit mode, where a naive
  // re-init leaves the nibble framing offset and every byte renders as garbage.
  // Sending the 0x3 nibble three times forces 8-bit mode regardless of the
  // current nibble phase; 0x2 then selects 4-bit mode, after which instructions
  // go out as high+low nibble pairs.
  sleepMs(50); // power-on settle (>40 ms)

  write4(0x30, kModeCmd); // 8-bit mode (nibble 0x3) ...
  sleepMs(5);
  write4(0x30, kModeCmd); // ... again ...
  sleepMs(1);
  write4(0x30, kModeCmd); // ... and again -> guaranteed 8-bit mode
  sleepMs(1);
  write4(0x20, kModeCmd); // switch to 4-bit mode (nibble 0x2)
  sleepMs(1);

  writeByte(kFunctionSet | k4BitMode | k2Line, kModeCmd); // 4-bit, 2-line, 5x8
  writeByte(kDisplayControl, kModeCmd);                   // display off
  writeByte(kClearDisplay, kModeCmd);
  sleepMs(2);
  writeByte(kEntryModeSet | kEntryLeft, kModeCmd); // increment, no shift
  writeByte(kDisplayControl | kDisplayOn, kModeCmd); // display on, no cursor
}

void LcdPcf8574::backlightOn() {
  backlight_ = 0x08;
  writeByte(kDisplayControl | kDisplayOn, kModeCmd);
}

void LcdPcf8574::clear() { writeByte(kClearDisplay, kModeCmd); }

void LcdPcf8574::defineChar(int index, const uint8_t glyph[8]) {
  // Point at CGRAM for this glyph slot, write its 8 rows. The next setCursor
  // (a DDRAM address) switches the controller back to display memory.
  writeByte(kSetCgramAddr | ((index & 0x07) << 3), kModeCmd);
  for (int i = 0; i < 8; ++i)
    writeByte(glyph[i], kModeChr);
}

void LcdPcf8574::setCursor(int col, int row) {
  if (row < 0 || row >= rows_)
    return;
  writeByte(kSetDdramAddr | (kRowBase[row] + col), kModeCmd);
}

void LcdPcf8574::writeCells(const uint8_t *cells, int n) {
  for (int i = 0; i < n; ++i)
    writeByte(cells[i], kModeChr);
}

} // namespace ctthw

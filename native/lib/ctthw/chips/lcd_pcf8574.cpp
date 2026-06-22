#include "chips/lcd_pcf8574.h"

#include <cstddef>

#include <unistd.h>

namespace ctthw {

namespace {

// PCF8574 control bits (JS displayPorts).
constexpr uint8_t kEnable = 0x04; // E strobe

// LCD register-select modes (the RS bit).
constexpr uint8_t kModeCmd = 0x00;
constexpr uint8_t kModeChr = 0x01;

// HD44780 commands.
constexpr uint8_t kClearDisplay = 0x01;
constexpr uint8_t kEntryModeSet = 0x04;
constexpr uint8_t kDisplayControl = 0x08;
constexpr uint8_t kFunctionSet = 0x20;

// Command flags.
constexpr uint8_t kEntryLeft = 0x02;
constexpr uint8_t kDisplayOn = 0x04;
constexpr uint8_t k4BitMode = 0x00;
constexpr uint8_t k2Line = 0x08;
constexpr uint8_t k5x10Dots = 0x04;

// DDRAM base address per row (rows 1-4), matching the JS LINEADDRESS table.
constexpr uint8_t kLineAddr[4] = {0x80, 0xC0, 0x94, 0xD4};

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
  sleepMs(1000); // power-on settle (matches JS)

  // HD44780 4-bit init dance.
  write4(0x33, kModeCmd);
  sleepMs(200);
  write4(0x32, kModeCmd);
  sleepMs(100);
  write4(0x06, kModeCmd);
  sleepMs(100);
  write4(0x28, kModeCmd);
  sleepMs(100);
  write4(0x01, kModeCmd);
  sleepMs(100);

  writeByte(kFunctionSet | k4BitMode | k2Line | k5x10Dots, kModeCmd);
  sleepMs(10);
  writeByte(kDisplayControl | kDisplayOn, kModeCmd);
  sleepMs(10);
  writeByte(kEntryModeSet | kEntryLeft, kModeCmd);
  sleepMs(10);
  writeByte(kClearDisplay, kModeCmd);
  writeByte(backlight_, kModeChr); // backlight on (matches JS)
}

void LcdPcf8574::backlightOn() {
  backlight_ = 0x08;
  writeByte(kDisplayControl | kDisplayOn, kModeCmd);
}

void LcdPcf8574::clear() { writeByte(kClearDisplay, kModeCmd); }

void LcdPcf8574::printStr(const std::string &text) {
  for (char c : text) {
    writeByte(static_cast<uint8_t>(c), kModeChr);
    sleepMs(2);
  }
}

void LcdPcf8574::writeLine(int row, const std::string &text) {
  if (row < 1 || row > rows_)
    return;
  writeByte(kLineAddr[row - 1], kModeCmd);
  printStr(text.substr(0, static_cast<std::size_t>(cols_)));
}

void LcdPcf8574::renderFrame(const std::vector<std::string> &lines) {
  backlightOn();
  clear();
  int n = static_cast<int>(lines.size());
  if (n > rows_)
    n = rows_;
  for (int i = 0; i < n; ++i)
    writeLine(i + 1, lines[i]);
}

} // namespace ctthw

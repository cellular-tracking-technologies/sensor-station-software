#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "i2c/i2c_bus.h"

namespace ctthw {

// HD44780 character LCD driven over a PCF8574 I2C backpack (the common 1602/2004
// "I2C LCD" module) at 0x27 or 0x3f. Faithful port of the field-proven
// station-lcd-interface/lcdi2c.js: same PCF8574 pin mapping, same 4-bit init
// dance, same nibble timing. The display is write-only — the menu/button logic
// stays in Node, which hands this driver the desired screen text.
//
// PCF8574 pin map (matches the JS displayPorts): RS = 0x01, E = 0x04,
// backlight = 0x08, data nibble D4-D7 = bits 4-7. Each LCD byte is sent high
// nibble then low nibble, each nibble clocked by an E high/low pulse (three
// PCF8574 port writes).
class LcdPcf8574 {
public:
  // Candidate backpack addresses, in probe order (matches the JS scan list).
  static constexpr int kAddrPrimary = 0x27;
  static constexpr int kAddrAlt = 0x3f;

  LcdPcf8574(I2cBus &bus, int addr, int cols, int rows)
      : bus_(bus), addr_(addr), cols_(cols), rows_(rows) {}

  // True if a device ACKs at this backpack address.
  bool present();

  // One-shot 4-bit bring-up (HD44780 reset dance + display/entry config +
  // backlight on). Run once after construction.
  void initialize();

  // Repaint the whole screen: backlight + display on, clear, then write each
  // line at its row. Lines beyond `rows` are ignored; each line is truncated to
  // `cols`; rows with no line are left blank by the clear. Mirrors the Node
  // Display.write(rows) path this replaces.
  void renderFrame(const std::vector<std::string> &lines);

private:
  void backlightOn();                               // DISPLAYCONTROL|DISPLAYON
  void clear();                                     // CLEARDISPLAY
  void writeLine(int row, const std::string &text); // 1-based row
  void printStr(const std::string &text);

  void send(uint8_t value);                // one raw byte to the PCF8574 port
  void write4(int value, uint8_t mode);    // clock one nibble (3 sends + E pulse)
  void writeByte(int value, uint8_t mode); // high nibble then low nibble

  I2cBus &bus_;
  int addr_;
  int cols_;
  int rows_;
  uint8_t backlight_ = 0x08; // 0x08 = on (matches the JS default)
};

} // namespace ctthw

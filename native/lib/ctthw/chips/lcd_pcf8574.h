#pragma once

#include <cstdint>

#include "i2c/i2c_bus.h"

namespace ctthw {

// HD44780 character LCD driven over a PCF8574 I2C backpack (the common 1602/2004
// "I2C LCD" module) at 0x27 or 0x3f. Faithful port of the field-proven
// station-lcd-interface/lcdi2c.js: same PCF8574 pin mapping, same 4-bit init
// dance, same nibble timing.
//
// The display is write-only and exposes HD44780 primitives — clear, define a
// custom CGRAM glyph, position the cursor, and write character cells. The
// ctt-lcd daemon drives it from a framebuffer (8 CGRAM glyphs + a grid of
// character cells); the menu/stats logic that decides what to show stays in the
// Node app.
//
// PCF8574 pin map (matches the JS displayPorts): RS = 0x01, E = 0x04,
// backlight = 0x08, data nibble D4-D7 = bits 4-7. Each LCD byte is sent high
// nibble then low nibble, each nibble clocked by an E high/low pulse.
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

  // Clear the whole display (and return the cursor home).
  void clear();

  // Define CGRAM glyph `index` (0-7) from 8 row-bytes (low 5 bits per row).
  void defineChar(int index, const uint8_t glyph[8]);

  // Position the cursor at (col, row), both 0-based.
  void setCursor(int col, int row);

  // Write `n` raw character cells (HD44780 codes; 0-7 select a CGRAM glyph) at
  // the current cursor position, advancing left to right.
  void writeCells(const uint8_t *cells, int n);

private:
  void backlightOn();                      // DISPLAYCONTROL|DISPLAYON, backlight on
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

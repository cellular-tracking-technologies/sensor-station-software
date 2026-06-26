#pragma once

#include "chips/tmp411.h" // Temperature (shared with the V3 temp sensor)
#include "i2c/i2c_bus.h"

namespace ctthw {

// TMP102 — I2C temperature sensor, the V2 board temp sensor (address 0x49).
// Fills the same Temperature struct the V3 TMP411 does.
//
// Port of hardware/sensors/tmp102.js: read the 2-byte temperature register,
// handle 12- or 13-bit mode (bit 0 of the second byte), apply 2's-complement,
// then x 0.0625 degC. NOTE: the JS sign-extended with `|= 0xF000/0xE000`, which
// in JS's 32-bit ints stays POSITIVE — so sub-zero temps decoded wrong. The
// positive range (the common case) is identical; this corrects the negative
// case with proper sign-extension so field temps below 0 degC read correctly.
class Tmp102 {
public:
  static constexpr int kDefaultAddr = 0x49;

  explicit Tmp102(I2cBus &bus, int addr = kDefaultAddr) : bus_(bus), addr_(addr) {}

  // Local temperature.
  Temperature readLocalTemperature();

private:
  I2cBus &bus_;
  int addr_;
};

} // namespace ctthw

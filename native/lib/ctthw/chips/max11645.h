#pragma once

#include "i2c/i2c_bus.h"

namespace ctthw {

struct AdcVoltages {
  double battery = 0;
  double solar = 0;
};

// MAX11645 — 2-channel 12-bit I2C ADC, the V3 board's health/voltage monitor
// (fixed address 0x36). Reads the battery (AIN1) and solar (AIN0) rail voltages.
//
// Faithful port of the Node driver (hardware/sensors/max11645.js): the board-
// specific reference (3.3 V) and resistive-divider factor (8.5) are V3 hardware
// constants, and the convert() bit-twiddle mirrors the JS exactly so values
// match. The MAX11645 is a byte-discriminated chip (no register pointer) — setup
// is a raw byte write, each read is a command byte then a 2-byte word read.
class Max11645 {
public:
  static constexpr int kDefaultAddr = 0x36;

  explicit Max11645(I2cBus &bus, int addr = kDefaultAddr) : bus_(bus), addr_(addr) {}

  // Battery + solar rail voltages (volts).
  AdcVoltages getVoltages();

private:
  unsigned readWord(uint8_t cmd);
  double convert(unsigned raw) const;

  I2cBus &bus_;
  int addr_;
  double ref_v_ = 3.3;
  double divider_ = 8.5;
};

} // namespace ctthw

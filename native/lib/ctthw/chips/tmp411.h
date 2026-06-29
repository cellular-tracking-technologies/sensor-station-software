#pragma once

#include "i2c/i2c_bus.h"

namespace ctthw {

struct Temperature {
  double celsius = 0;
  double fahrenheit = 0;
};

// TMP411 — local + remote temperature sensor, the V3 board temp sensor (address
// 0x4e). Only the local (die/board) temperature is read, in extended range.
// Faithful port of hardware/sensors/temperature/tmp411.js.
class Tmp411 {
public:
  static constexpr int kDefaultAddr = 0x4e;

  explicit Tmp411(I2cBus &bus, int addr = kDefaultAddr) : bus_(bus), addr_(addr) {}

  // Local temperature. Configures extended range, reads the high+low bytes, and
  // decodes °C = high - 64 (+0.5 when the low byte is 0x80), matching the JS.
  Temperature readLocalTemperature();

private:
  I2cBus &bus_;
  int addr_;
};

} // namespace ctthw

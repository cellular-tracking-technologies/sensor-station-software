#pragma once

#include "chips/max11645.h" // AdcVoltages (shared with the V3 ADC)
#include "i2c/i2c_bus.h"

namespace ctthw {

// ADS7924 — 4-channel 12-bit I2C ADC, the V2 board's rail-voltage monitor
// (address 0x48). Reads battery (ch0) + solar (ch1) and fills the same
// AdcVoltages the V3 MAX11645 does, so board/sensors.cpp is uniform.
//
// Faithful port of the Node driver (hardware/sensors/ads7924.js) plus the
// scaling from its v2-driver.js: each raw 12-bit channel ->
//   volts = raw * (5.016 / 4096) * 6
// (5.016 V reference and a 6:1 resistive divider — V2 hardware constants, the
// analogue of the MAX11645's 3.3 V / 8.5). The third channel (ch2 "rtc") the
// old driver reported is NOT modelled here — like the V3 path, the publisher
// emits the rtc constant — so only battery + solar are read.
//
// The chip's RESET line (BCM 19) is de-asserted at boot by config.txt
// (gpio=19=op,dh in system/device-tree/config-v2.txt), so this driver is pure
// I2C — no GPIO — like the rest of ctthw.
class Ads7924 {
public:
  static constexpr int kDefaultAddr = 0x48;

  explicit Ads7924(I2cBus &bus, int addr = kDefaultAddr) : bus_(bus), addr_(addr) {}

  // Battery (ch0) + solar (ch1) rail voltages (volts).
  AdcVoltages getVoltages();

private:
  double convert(unsigned raw) const { return raw * (ref_v_ / 4096.0) * divider_; }

  I2cBus &bus_;
  int addr_;
  double ref_v_ = 5.016;
  double divider_ = 6.0;
};

} // namespace ctthw

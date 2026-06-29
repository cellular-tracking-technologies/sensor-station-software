#include "chips/tmp102.h"

namespace ctthw {

namespace {
constexpr uint8_t kTempReg = 0x00; // temperature register: 2 bytes [msb, lsb]
} // namespace

Temperature Tmp102::readLocalTemperature() {
  I2cBus::Lock lk(bus_);
  auto d = bus_.readReg(addr_, kTempReg, 2);
  const int b0 = d[0], b1 = d[1];

  int digital;
  if (b1 & 0x01) {
    // 13-bit (extended) mode
    digital = (b0 << 5) | (b1 >> 3);
    if (digital & 0x1000) // bit 12 set -> negative; sign-extend the 13-bit value
      digital -= 0x2000;
  } else {
    // 12-bit (default) mode
    digital = (b0 << 4) | (b1 >> 4);
    if (digital & 0x800) // bit 11 set -> negative; sign-extend the 12-bit value
      digital -= 0x1000;
  }

  const double celsius = digital * 0.0625; // 1 LSB = 0.0625 degC
  return {celsius, celsius * 9.0 / 5.0 + 32.0};
}

} // namespace ctthw

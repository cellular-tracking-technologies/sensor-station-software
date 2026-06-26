#include "chips/ads7924.h"

namespace ctthw {

namespace {
// Config registers + values, matching hardware/sensors/ads7924.js exactly.
constexpr uint8_t kModeCntrl = 0x00; // <- 0xCC (auto-scan)
constexpr uint8_t kAcqConfig = 0x14; // <- 0x1F
constexpr uint8_t kPwrConfig = 0x15; // <- 0x80
constexpr uint8_t kData0Upper = 0x02; // ch0: 0x02 upper8, 0x03 lower4 (bits 7:4)
} // namespace

AdcVoltages Ads7924::getVoltages() {
  I2cBus::Lock lk(bus_);
  // Configure (same order/values as the JS): power, mode (auto-scan), acquire.
  bus_.writeReg(addr_, kPwrConfig, {0x80});
  bus_.writeReg(addr_, kModeCntrl, {0xCC});
  bus_.writeReg(addr_, kAcqConfig, {0x1F});

  // Auto-increment read of the ch0+ch1 data-register pairs: [D0_U, D0_L, D1_U, D1_L].
  // Each 12-bit value = (upper << 4) | (lower >> 4), as in the JS.
  auto d = bus_.readReg(addr_, kData0Upper, 4);
  unsigned battery_raw = (static_cast<unsigned>(d[0]) << 4) | (d[1] >> 4);
  unsigned solar_raw = (static_cast<unsigned>(d[2]) << 4) | (d[3] >> 4);

  return {convert(battery_raw), convert(solar_raw)};
}

} // namespace ctthw

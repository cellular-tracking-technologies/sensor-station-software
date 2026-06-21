#include "chips/tmp411.h"

namespace ctthw {

namespace {
constexpr uint8_t kConfigWrite = 0x09;
constexpr uint8_t kLocalHigh = 0x00;
constexpr uint8_t kLocalLow = 0x15;
constexpr uint8_t kRangeExtended = 0x04; // config bit2 = extended range (offset 64)
constexpr int kRangeOffset = 0x40;
} // namespace

Temperature Tmp411::readLocalTemperature() {
  I2cBus::Lock lk(bus_);
  bus_.writeReg(addr_, kConfigWrite, {kRangeExtended}); // configure() extended range
  auto low = bus_.readReg(addr_, kLocalLow, 1);
  auto high = bus_.readReg(addr_, kLocalHigh, 1);
  double celsius = static_cast<int>(high[0]) - kRangeOffset;
  if (low[0] == 128) // JS: low === 128 -> +0.5 fraction
    celsius += 0.5;
  return {celsius, celsius * 9.0 / 5.0 + 32.0};
}

} // namespace ctthw

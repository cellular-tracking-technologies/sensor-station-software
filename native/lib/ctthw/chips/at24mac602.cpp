#include "chips/at24mac602.h"

namespace ctthw {

namespace {
constexpr uint8_t kRegEui64 = 0x98;
constexpr std::size_t kEui64Len = 8;
} // namespace

std::vector<uint8_t> At24mac602::readEui64() {
  I2cBus::Lock lk(bus_);
  return bus_.readReg(addr_, kRegEui64, kEui64Len);
}

} // namespace ctthw

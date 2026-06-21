#include "chips/mcp79412.h"

namespace ctthw {

namespace {
constexpr uint8_t kRegEui64 = 0xF0; // protected EEPROM EUI-64 block (0xF0..0xF7)
constexpr std::size_t kEui64Len = 8;
} // namespace

std::vector<uint8_t> Mcp79412::readEui64() {
  I2cBus::Lock lk(bus_);
  return bus_.readReg(eeprom_addr_, kRegEui64, kEui64Len);
}

} // namespace ctthw

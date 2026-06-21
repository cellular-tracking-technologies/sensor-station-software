#pragma once

#include <cstdint>
#include <vector>

#include "i2c/i2c_bus.h"

namespace ctthw {

// AT24MAC602 — I2C serial EEPROM with a factory-programmed, globally-unique
// EUI-64 node identifier. CTT uses that EUI-64 as the board id source on V3
// rev 1+. (The same part also has a user EEPROM array + a 128-bit serial; add
// methods here if those are ever needed.)
class At24mac602 {
public:
  static constexpr int kDefaultAddr = 0x58;

  explicit At24mac602(I2cBus &bus, int addr = kDefaultAddr) : bus_(bus), addr_(addr) {}

  // The 8-byte factory EUI-64 (read from the protected id region at 0x98).
  std::vector<uint8_t> readEui64();

private:
  I2cBus &bus_;
  int addr_;
};

} // namespace ctthw

#pragma once

#include <cstdint>
#include <vector>

#include "i2c/i2c_bus.h"

namespace ctthw {

// MCP79412 — battery-backed I²C RTCC with a protected EEPROM, the V3 RTC (it
// replaced the DS3231 used on V2). It presents as TWO I²C devices: the RTCC +
// SRAM at 0x6F, and the EEPROM / protected-EEPROM / STATUS at 0x57. The
// protected EEPROM holds a factory EUI-64 that CTT uses as the board id source
// on V3 rev 0 boards.
//
// Only the EUI-64 read is modelled. Timekeeping (0x6F) is handled by the kernel
// rtc-mcp7941x driver; add RTCC methods here only if a tool needs raw access.
class Mcp79412 {
public:
  // EEPROM / protected-EEPROM / STATUS device address (the RTCC answers at 0x6F).
  static constexpr int kEepromAddr = 0x57;

  explicit Mcp79412(I2cBus &bus, int eeprom_addr = kEepromAddr)
      : bus_(bus), eeprom_addr_(eeprom_addr) {}

  // The factory EUI-64 (8 bytes) from the protected EEPROM block at 0xF0..0xF7.
  // No unlock is required to read it.
  std::vector<uint8_t> readEui64();

private:
  I2cBus &bus_;
  int eeprom_addr_;
};

} // namespace ctthw

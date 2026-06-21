#include "chips/max11645.h"

namespace ctthw {

namespace {
constexpr uint8_t kSetup = 0x82;      // setup byte: VDD reference (JS 0b10000010)
constexpr uint8_t kSolarCmd = 0x61;   // config: AIN0 single-ended (JS 0b01100001)
constexpr uint8_t kBatteryCmd = 0x63; // config: AIN1 single-ended (JS 0b01100011)
} // namespace

// SMBus-style word read: write the command byte, read 2 bytes. The i2c-bus
// readWord the JS used returns the first byte as the LOW byte (little-endian).
unsigned Max11645::readWord(uint8_t cmd) {
  auto b = bus_.readReg(addr_, cmd, 2);
  return static_cast<unsigned>(b[0]) | (static_cast<unsigned>(b[1]) << 8);
}

// Mirror of the JS convertResponse(): value ^ 0xf0, byte-swap (writeUInt16LE ->
// readUInt16BE), then scale by reference * divider / 4096.
double Max11645::convert(unsigned raw) const {
  unsigned v = raw ^ 0xf0;
  unsigned swapped = ((v & 0xff) << 8) | ((v >> 8) & 0xff);
  return static_cast<double>(swapped) * ref_v_ * divider_ / 4096.0;
}

AdcVoltages Max11645::getVoltages() {
  I2cBus::Lock lk(bus_); // setup + both channel reads atomic on the shared bus
  bus_.writeBytes(addr_, {kSetup});
  unsigned batt = readWord(kBatteryCmd);
  unsigned solar = readWord(kSolarCmd);
  return {convert(batt), convert(solar)};
}

} // namespace ctthw

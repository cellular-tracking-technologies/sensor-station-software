#include "chips/sx1509b.h"

namespace ctthw {

namespace {
// SX1509B register map (subset used for the strap read).
constexpr uint8_t kRegReset = 0x71;
constexpr uint8_t kRegPullUpB = 0x06;
constexpr uint8_t kRegPullUpA = 0x07;
constexpr uint8_t kRegDirB = 0x0E; // 1 = input
constexpr uint8_t kRegDirA = 0x0F;
constexpr uint8_t kRegDataA = 0x11;

constexpr uint8_t kConfigMaskA = 0xFE; // config pins 1-7
constexpr uint8_t kButtonMaskB = 0xF0; // buttons 12-15
} // namespace

bool Sx1509b::present() { return bus_.present(addr_, kRegDataA); }

void Sx1509b::initialize() {
  I2cBus::Lock lk(bus_); // keep the reset+config sequence atomic on the bus
  bus_.writeReg(addr_, kRegReset, {0x12, 0x34});   // software reset
  bus_.writeReg(addr_, kRegPullUpA, {kConfigMaskA}); // pull-ups: config pins 1-7
  bus_.writeReg(addr_, kRegPullUpB, {kButtonMaskB}); // pull-ups: buttons 12-15
  bus_.writeReg(addr_, kRegDirA, {kConfigMaskA});    // direction: inputs (1 = in)
  bus_.writeReg(addr_, kRegDirB, {kButtonMaskB});
}

int Sx1509b::readRevision() {
  I2cBus::Lock lk(bus_);
  auto a = bus_.readReg(addr_, kRegDataA, 1);
  return ((~static_cast<unsigned>(a[0])) & 0xFF) >> 1;
}

} // namespace ctthw

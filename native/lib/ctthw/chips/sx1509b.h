#pragma once

#include "i2c/i2c_bus.h"

namespace ctthw {

// The two 8-bit data registers: bank A = pins 0-7 (RegDataA), bank B = pins 8-15
// (RegDataB). Writing a bit drives that pin if it's configured as an output;
// input pins ignore their data bit.
struct BankData {
  uint8_t a = 0;
  uint8_t b = 0;
};

// SX1509B — 16-channel I2C GPIO expander. On CTT V3 boards its low config pins
// are strapped to encode the board revision; its presence on the bus also
// distinguishes V3 (present) from V2 (absent). initialize() configures the
// config/button pins as inputs and (by the same masks) the rest — including the
// status-LED pins 0/10/11 — as outputs.
//
// Bring-up (initialize) and use (read straps / drive LED data) are separate:
// initialize() enables the WHOLE expander once at boot, after which any number
// of reads/writes operate on the configured chip.
class Sx1509b {
public:
  static constexpr int kDefaultAddr = 0x70;

  explicit Sx1509b(I2cBus &bus, int addr = kDefaultAddr) : bus_(bus), addr_(addr) {}

  // True if the expander ACKs on the bus (=> V3 board).
  bool present();

  // One-shot bring-up (run once on boot): software-reset, then configure the
  // config pins (1-7) and button pins (12-15) as pulled-up inputs (the same
  // masks leave the LED pins as outputs). Idempotent, but a re-run resets any
  // runtime pin state.
  void initialize();

  // Decode the strapped board revision from bank A: (~RegDataA & 0xFF) >> 1.
  // Requires initialize() to have run (this boot or a prior one).
  int readRevision();

  // Read / write the output data registers (for driving the status LEDs). Use
  // read-modify-write to avoid disturbing other output pins.
  BankData readData();
  void writeData(BankData d);

private:
  I2cBus &bus_;
  int addr_;
};

} // namespace ctthw

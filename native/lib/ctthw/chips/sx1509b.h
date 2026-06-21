#pragma once

#include "i2c/i2c_bus.h"

namespace ctthw {

// SX1509B — 16-channel I2C GPIO expander. On CTT V3 boards its low config pins
// are strapped to encode the board revision; its presence on the bus also
// distinguishes V3 (present) from V2 (absent).
//
// Bring-up (initialize) and reading are intentionally separate: initialize()
// enables the WHOLE expander once (it also sets up the button pins, not just the
// revision straps), after which any number of reads — revision now; buttons /
// GPIO / LED / keypad later — operate on the configured chip.
class Sx1509b {
public:
  static constexpr int kDefaultAddr = 0x70;

  explicit Sx1509b(I2cBus &bus, int addr = kDefaultAddr) : bus_(bus), addr_(addr) {}

  // True if the expander ACKs on the bus (=> V3 board).
  bool present();

  // One-shot bring-up (run once on boot): software-reset, then configure the
  // config pins (1-7) and button pins (12-15) as pulled-up inputs — enabling the
  // expander for use. Idempotent, but a re-run resets any runtime pin state.
  void initialize();

  // Decode the strapped board revision from bank A: (~RegDataA & 0xFF) >> 1.
  // Requires initialize() to have run (this boot or a prior one).
  int readRevision();

private:
  I2cBus &bus_;
  int addr_;
};

} // namespace ctthw

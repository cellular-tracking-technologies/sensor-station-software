#pragma once

#include <string>

#include "i2c/i2c_bus.h"

namespace ctthw {

// Resolved board identity (drop-in with the old Node initialize.js outputs).
struct Identity {
  int version = 0;     // 2 or 3
  int revision = 0;    // hardware revision (0/1/2)
  std::string id;      // station id string
  std::string board;   // CTT_BOARD: v2 | v3r0 | v3r3
};

// Detect the board identity by composing the chip drivers on `bus`:
//   - SX1509B present  => V3: read the strapped revision, then pick the id
//                         source by revision (DS3231 EEPROM on rev 0/127;
//                         AT24MAC602 EUI-64 on rev 1/2).
//   - SX1509B absent   => V2: id from the ATSHA204A serial (hashlet).
// All "which chip / how to format the id" policy lives here, in one place, so
// no other tool re-derives it. Throws std::runtime_error on an unknown revision
// or a hardware read failure.
Identity detectIdentity(I2cBus &bus);

} // namespace ctthw

#pragma once

#include <string>

namespace ctthw {

// ATSHA204A — crypto authentication chip whose factory serial number is the
// board id source on V2 boards.
//
// Behaviour-preserving: the id is still obtained by shelling out to `hashlet
// serial-num` (matching the original Node path), so this class does not touch
// the I2C bus yet. A future native read (ATSHA204A @ 0x64 over I2cBus) would
// drop the hashlet dependency; keep the same serialNumber() contract when it
// lands.
class Atsha204a {
public:
  // The 12-character board serial (mirrors the old id.substring(4, 16)).
  // Throws std::runtime_error if hashlet is unavailable or returns garbage.
  std::string serialNumber();
};

} // namespace ctthw

#pragma once

#include <optional>

#include "chips/max11645.h" // AdcVoltages
#include "chips/tmp411.h"   // Temperature
#include "i2c/i2c_bus.h"

namespace ctthw {

// One best-effort snapshot of the station's analog sensors. Each field is
// optional and set only if its source chip was read successfully this cycle, so
// one unavailable device (e.g. the TMP411 not ACKing) leaves just its own fields
// unset instead of discarding the whole reading. (rtc is not read on V3 — the
// Node driver hard-coded -1 — so it is not modelled here; the publisher emits
// the constant.)
struct SensorReading {
  std::optional<double> battery;    // MAX11645 AIN1
  std::optional<double> solar;      // MAX11645 AIN0
  std::optional<double> celsius;    // TMP411 local
  std::optional<double> fahrenheit; // TMP411 local
};

// Read the board's sensors, selecting chips by board version (the policy, in one
// place — like board_id). V3 = MAX11645 (ADC) + TMP411 (temp); V2 = ADS7924
// (ADC) + TMP102 (temp). Reads each chip independently and does NOT throw for a
// per-chip I/O failure — the failed chip's fields are simply left unset, so the
// caller still gets the others.
SensorReading readSensors(I2cBus &bus, int version);

} // namespace ctthw

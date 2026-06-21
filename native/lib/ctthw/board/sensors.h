#pragma once

#include "chips/max11645.h" // AdcVoltages
#include "chips/tmp411.h"   // Temperature
#include "i2c/i2c_bus.h"

namespace ctthw {

// One snapshot of the station's analog sensors (matches the Node SensorMonitor
// shape: voltages {battery, solar, rtc} + temperature {celsius, fahrenheit}).
struct SensorReading {
  double battery = 0;
  double solar = 0;
  double rtc = -1; // not read on V3 (the Node driver hard-codes rtc: -1)
  double celsius = 0;
  double fahrenheit = 0;
};

// Read the board's sensors, selecting chips by board version (the policy, in one
// place — like board_id). V3 = MAX11645 (ADC) + TMP411 (temp). V2 (ADS7924 +
// TMP102) is not yet ported (datasheet-only) and throws.
SensorReading readSensors(I2cBus &bus, int version);

} // namespace ctthw

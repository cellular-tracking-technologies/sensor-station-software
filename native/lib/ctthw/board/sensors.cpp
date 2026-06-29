#include "board/sensors.h"

#include <exception>

#include "chips/ads7924.h" // V2 ADC
#include "chips/tmp102.h"  // V2 temp

namespace ctthw {

SensorReading readSensors(I2cBus &bus, int version) {
  SensorReading out;

  if (version < 3) {
    // V2: ADS7924 ADC (battery/solar) + TMP102 temp. Same per-chip isolation as
    // V3 — one unavailable chip leaves only its own fields unset. (The ADS7924
    // reset is de-asserted at boot by config.txt gpio=19=op,dh.)
    try {
      AdcVoltages v = Ads7924(bus).getVoltages();
      out.battery = v.battery;
      out.solar = v.solar;
    } catch (const std::exception &) {
      // leave battery/solar unset
    }
    try {
      Temperature t = Tmp102(bus).readLocalTemperature();
      out.celsius = t.celsius;
      out.fahrenheit = t.fahrenheit;
    } catch (const std::exception &) {
      // leave celsius/fahrenheit unset
    }
    return out;
  }

  // Read each chip in its own try block so one unavailable device degrades only
  // its own fields — a TMP411 failure must not discard the MAX11645 voltages
  // that read fine. The library does not log or exit on a per-chip failure;
  // surfacing/keeping-last is the daemon's job (see ctt-sensors).
  try {
    AdcVoltages v = Max11645(bus).getVoltages();
    out.battery = v.battery;
    out.solar = v.solar;
  } catch (const std::exception &) {
    // leave battery/solar unset
  }
  try {
    Temperature t = Tmp411(bus).readLocalTemperature();
    out.celsius = t.celsius;
    out.fahrenheit = t.fahrenheit;
  } catch (const std::exception &) {
    // leave celsius/fahrenheit unset
  }
  return out;
}

} // namespace ctthw

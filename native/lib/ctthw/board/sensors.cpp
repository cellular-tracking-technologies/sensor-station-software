#include "board/sensors.h"

#include <stdexcept>

namespace ctthw {

SensorReading readSensors(I2cBus &bus, int version) {
  if (version < 3) {
    // V2 path (ADS7924 ADC + TMP102 temp) not yet ported — datasheet-only,
    // and there's no V2 station to validate against. See ctthw-chip-design-notes.
    throw std::runtime_error("V2 sensors not yet implemented (ADS7924/TMP102)");
  }

  SensorReading out;
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

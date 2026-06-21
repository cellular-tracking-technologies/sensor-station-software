#include "board/sensors.h"

#include <stdexcept>

namespace ctthw {

SensorReading readSensors(I2cBus &bus, int version) {
  SensorReading out;
  if (version >= 3) {
    AdcVoltages v = Max11645(bus).getVoltages();
    out.battery = v.battery;
    out.solar = v.solar;
    Temperature t = Tmp411(bus).readLocalTemperature();
    out.celsius = t.celsius;
    out.fahrenheit = t.fahrenheit;
  } else {
    // V2 path (ADS7924 ADC + TMP102 temp) not yet ported — datasheet-only,
    // and there's no V2 station to validate against. See ctthw-chip-design-notes.
    throw std::runtime_error("V2 sensors not yet implemented (ADS7924/TMP102)");
  }
  return out;
}

} // namespace ctthw

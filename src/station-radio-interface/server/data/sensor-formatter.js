import moment from 'moment'

/**
 * file formatter for the station's own sensor rail readings.
 *
 * These are the battery / solar / RTC voltages and board temperature the
 * hardware server exposes on /sensor/details. Until this logger existed they
 * were the only telemetry stream with no file on disk -- they lived solely in
 * ServerApi.sensor_data (in memory, capped at max_sensor_records) and reached
 * the server only as the `sensor` block of a health checkin. Any restart,
 * reboot or power loss discarded them, which is why battery history has gaps
 * that look like server-side problems. Note enable-modem.sh reboots the
 * station, so the modem-recovery path itself destroyed pending readings.
 *
 * Writing them here puts them on the same footing as beeps and GPS: rotated
 * hourly and delivered by uploader.py, which retries across days. The checkin
 * still carries them, but is no longer their only transport.
 *
 * A rail the hardware could not read comes back as -1; that is written as an
 * EMPTY cell, never 0 -- "no reading" and "0.00 V" are different facts, and a
 * -1 would otherwise be charted as a real voltage.
 */
class SensorFormatter {
  /**
   * @param {*} opts
   * @param {String} opts.date_format
   */
  constructor(opts) {
    this.header = [
      'Time',
      'BatteryVolts',
      'SolarVolts',
      'RtcVolts',
      'TempCelsius',
    ]
    this.date_format = opts.date_format
  }

  /**
   * @param {Object} record - /sensor/details response, stamped with received_at
   * @param {Object} record.voltages - { battery, solar, rtc }
   * @param {Object} record.temperature - { celsius, fahrenheit }
   * @param {String} record.received_at - ISO timestamp added by the poller
   */
  formatRecord(record) {
    if (!record) return null
    const voltages = record.voltages || {}
    const temperature = record.temperature || {}
    // -1 is the hardware server's "could not read this rail" sentinel
    const cell = (value) => {
      if (value === undefined || value === null) return ''
      if (Number(value) === -1) return ''
      return value
    }
    const at = record.received_at ? moment(record.received_at) : moment()
    return [
      at.format(this.date_format),
      cell(voltages.battery),
      cell(voltages.solar),
      cell(voltages.rtc),
      cell(temperature.celsius),
    ]
  }
}

export { SensorFormatter }

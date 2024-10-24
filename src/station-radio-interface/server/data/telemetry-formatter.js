import moment from 'moment'
/**
 * file formatter for Telmetry Data
 */
class TelemetryFormatter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'ReceivedAt',
      'RecordedAt',
      'Id',
      'RadioId',
      'Rssi',
      'Latitude',
      'Longitude',
      'Activity',
      'Hdop',
      'Speed',
      'Altitude',
      'Battery',
      'SolarMa',
      'Celsius',
      'TTFF'
    ]
    this.date_format = opts.date_format
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    if (record.protocol) {
      // new protocol
      let recorded_at = moment(new Date(record.data.time*1000)).utc()
      return [
        record.received_at.format(this.date_format),
        recorded_at.format(this.date_format),
        record.meta.source.id,
        record.channel,
        record.meta.rssi,
        record.data.lat,
        record.data.lon,
        record.data.act,
        record.data.hdop,
        record.data.speed,
        record.data.altitude,
        record.data.battery,
        record.data.solar_ma,
        record.data.temp_c,
        record.data.ttff
      ]
    } 
  }
}

export { TelemetryFormatter }
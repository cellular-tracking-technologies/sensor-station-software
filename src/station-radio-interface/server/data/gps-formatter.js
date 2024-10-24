import moment from 'moment'
/**
 * file formatter for GPS files
 */
class GpsFormatter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'recorded at',
      'gps at',
      'latitude',
      'longitude',
      'altitude',
      'quality',
      'mean lat',
      'mean lng',
      'n fixes'
    ]
    this.gps_precision = opts.gps_precision ? opts.gps_precision : 6
    this.date_format = opts.date_format
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    let fields
    let now = moment(new Date()).utc().format(this.date_format)
    if (record.gps) {
      fields = [
        now,
        moment(record.gps.time).utc().format(this.date_format),
        record.gps.lat.toFixed(this.gps_precision),
        record.gps.lon.toFixed(this.gps_precision),
        record.gps.alt,
        record.gps.mode,
        record.mean.lat,
        record.mean.lng,
        record.mean.n
      ]
    } else {
      // no record - add recorded at
      fields = [
        now,
        null,
        null,
        null,
        null,
        null
      ]
    }
    return fields
  }
}

export { GpsFormatter }
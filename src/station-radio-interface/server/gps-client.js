import gpsd from 'node-gpsd'
import EventEmitter from 'events'

/**
 * maintain a connection to gpsd daemon and maintain most recent gps info
 * merge sky satellites with gps data into gps_sate object
 */
class GpsClient extends EventEmitter {
  constructor(opts) {
    super()
    this.latest_gps_fix
    this.latest_sky_view
    this.latest_fix
    this.recent_gps_records = []
    this.max_gps_records = opts.max_gps_records

    this.buildGpsClient()
  }

  /**
   * return current latest info
   */
  info() {
    return {
      gps: this.latest_gps_fix,
      sky: this.latest_sky_view,
      mean: this.meanFix()
    }
  }

  /**
   * calculate mean lat/lng for previous set of records up to this.max_gps_records
   */
  meanFix() {
    let mean_lat = 0, mean_lng = 0, n = 0
    if (this.recent_gps_records.length < 1) {
      return
    }
    this.recent_gps_records.forEach((record) => {
      if (record.lat) {
        mean_lat += record.lat
        mean_lng += record.lon
        n += 1
      }
    })
    if (n < 1) {
      return
    }
    mean_lat = mean_lat / n
    mean_lng = mean_lng / n
    return {
      lat: mean_lat.toFixed(6),
      lng: mean_lng.toFixed(6),
      n: n
    }
  }

  addGpsRecord(record) {
    this.recent_gps_records.push(record)
    if (this.recent_gps_records.length > this.max_gps_records) {
      this.recent_gps_records.shift()
    }
  }

  buildGpsClient() {
    this.gps_listener = new gpsd.Listener({
      port: 2947,
      hostname: 'localhost',
      parse: true
    })
    this.gps_listener.on('TPV', (data) => {
      // time-position-velocity report
      this.latest_fix = data
      if (data.mode > 1) {
        // we have a 2d or 3d fix
        if (this.latest_gps_fix === null) {
          // first gps fix acquired
          this.emit('initial-fix', data)
        }
        this.latest_gps_fix = data
      }

      // handle fix type
      switch (data.mode) {
        case 0:
          break
        case 1:
          break
        case 2:
          // 2d fix
          this.emit('2d-fix', this.info())
          break
        case 3:
          // 3d fix
          this.emit('3d-fix', this.info())
          this.addGpsRecord(data)
          break
        default:
          break
      }
    })

    this.gps_listener.on('SKY', (data) => {
      // sky view of GPS satellite positions
      if (this.latest_sky_view === null) {
        // first satellite view acquired
        this.emit('initial-sky', data)
      }
      this.latest_sky_view = data
    })
  }

  start() {
    this.gps_listener.connect(() => { })
    this.gps_listener.watch()
  }

  stop() {
    this.gps_listener.disconnect()
  }
}

export { GpsClient }
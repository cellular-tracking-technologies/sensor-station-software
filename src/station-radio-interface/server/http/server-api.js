import fetch from 'node-fetch'
import fs from 'fs'
import moment from 'moment'
class ServerApi {
  constructor() {
    this.endpoint = "https://station.internetofwildlife.com/station/v2/checkin/"
    this.hardware_endpoint = "http://localhost:3000/"
    this.details = [
      'modem',
      'sensor/details',
      //'peripherals',
      'gps',
      'about',
      'internet/pending-upload',
      'node/version',
      'revision',
    ]
    this.sensor_data = []
    this.max_sensor_records = 100
    this.hardware_timeout_ms = 5000
    this.remote_timeout_ms = 15000
    this.modem_blacklist_file = '/etc/modprobe.d/blacklist-qmi_wwan.conf'
  }

  isModemEnabled() {
    return !fs.existsSync(this.modem_blacklist_file)
  }

  async fetchWithTimeout(url, options = {}, timeout_ms) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout_ms)
    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  pollSensors() {
    let uri = `${this.hardware_endpoint}sensor/details`
    this.fetchWithTimeout(uri, {}, this.hardware_timeout_ms).then(res => res.json())
      .then((data) => {
        let now = moment()
        data.received_at = now.toISOString()
        this.sensor_data.push(data)
        if (this.sensor_data.length > this.max_sensor_records) {
          // only store up to a maximum number of sensor records
          this.sensor_data.shift()
        }
      })
  }

  filterStats(stats) {
    Object.keys(stats.channels).forEach((channel) => {
      let channel_data = stats.channels[channel]

      Object.keys(channel_data.beeps).forEach((tag) => {
        let cnt = channel_data.beeps[tag]
        if (cnt < 5) {
          delete channel_data.beeps[tag]
        }
      })
      Object.keys(channel_data.nodes.beeps).forEach((tag) => {
        let cnt = channel_data.nodes.beeps[tag]
        if (cnt < 5) {
          delete channel_data.nodes.beeps[tag]
        }
      })
    })
    return stats
  }


  async checkInternet() {
    try {
      const res = await this.fetchWithTimeout(`${this.hardware_endpoint}internet/status`, {}, this.hardware_timeout_ms)
      const json = await res.json()
      return json.success == 3
    } catch (err) {
      return false
    }
  }

  /**
   * Clean GPS data from aggregated qaqc report information
   * @param {*} data 
   */
  cleanGps(data) {
    let gps = {
      lat: null,
      lng: null,
      time: null
    }
    if (data.gps) {
      if (data.gps.gps) {
        gps.lat = data.gps.gps.lat
        gps.lng = data.gps.gps.lon
        gps.time = data.gps.gps.time
      }
    }
    return gps
  }

  healthCheckin(stats, radio_fw, blu_stats, blu_fw) {

    return new Promise((resolve, reject) => {
      let promises = []
      const modemEnabled = this.isModemEnabled()
      // generate list of promises to post requests to hardware server
      this.details.forEach((post) => {
        if (post === 'modem' && !modemEnabled) {
          promises.push(Promise.resolve(null))
          return
        }
        let uri = `${this.hardware_endpoint}${post}`
        promises.push(this.fetchWithTimeout(uri, {}, this.hardware_timeout_ms).then(res => res.json()))
      })
      // use allSettled so one slow/failed endpoint doesn't block the entire checkin
      Promise.allSettled(promises)
        .then((results) => {
          const responses = results.map((result, i) => {
            if (result.status === 'fulfilled') {
              return result.value
            }
            console.error(`failed to fetch ${this.details[i]}: ${result.reason}`)
            return null
          })
          return {
            'modem': responses[0],
            //'peripherals': responses[2],
            'gps': responses[2],
            'about': responses[3],
            'uploads': responses[4],
            'software': responses[5],
            'revision': responses[6],
            'radio': radio_fw,
            'blu': blu_fw
          }
        })
        .then((data) => {
          // aggregated reponses from hardware server requests
          // clean gps coordinates
          data.gps = this.cleanGps(data)
          data.sensor = this.sensor_data
          data.stats = this.filterStats(stats)
          data.blu_stats = blu_stats
          // initialize server checkin
          this.fetchWithTimeout(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }, this.remote_timeout_ms)
            .then((res) => {
              if (res.ok) {
                // we have a successful server checkin - clear sensor data
                this.sensor_data = []
                resolve(true)
              } else {
                res.text().then(body => {
                  console.error(`checkin response: ${res.status} ${res.statusText} - ${body}`)
                }).catch(() => {
                  console.error(`checkin response: ${res.status} ${res.statusText}`)
                })
                resolve(false)
              }
            })
            .catch((err) => {
              console.log('unable to check into server')
              console.error(err)
              reject(err)
            })
        })
        .catch((err) => {
          console.error(err)
          console.error('error getting station details')
          reject(err)
        })
    })
  }
}

export { ServerApi }
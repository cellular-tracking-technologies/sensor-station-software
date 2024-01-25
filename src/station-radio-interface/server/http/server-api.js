import fetch from 'node-fetch'
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
  }

  pollSensors() {
    let uri = `${this.hardware_endpoint}sensor/details`
    fetch(uri).then(res => res.json())
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
    console.log('filter stats', stats)
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

  checkInternet() {
    return fetch(`${this.hardware_endpoint}internet/status`)
      .then(res => res.json())
      .then(json => {
        if (json.success == 3) {
          return true
        }
      })
      .catch((err) => {
        console.error('error checking internet status')
        console.error(err)
        return false
      })
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

  healthCheckin(stats, radio_fw) {
    console.log('health check in stats', stats, 'radio fw', radio_fw)
    return new Promise((resolve, reject) => {
      let promises = []
      // generate list of promises to post requests to hardware server
      this.details.forEach((post) => {
        let uri = `${this.hardware_endpoint}${post}`
        promises.push(fetch(uri).then(res => res.json()))
      })
      Promise.all(promises)
        .then((responses) => {
          return {
            'modem': responses[0],
            //'peripherals': responses[2],
            'gps': responses[2],
            'about': responses[3],
            'uploads': responses[4],
            'software': responses[5],
            'revision': responses[6],
            'radio': radio_fw,
            // 'blu': blu_fw
          }
        })
        .then((data) => {
          // aggregated reponses from hardware server requests
          // clean gps coordinates
          data.gps = this.cleanGps(data)
          data.sensor = this.sensor_data
          data.stats = this.filterStats(stats)
          // initialize server checkin
          fetch(this.endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          })
            .then((res) => {
              if (res.ok) {
                // we have a successful server checkin - clear sensor data
                this.sensor_data = []
                resolve(true)
              } else {
                console.error('did not receive a valid checkin response from the server')
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
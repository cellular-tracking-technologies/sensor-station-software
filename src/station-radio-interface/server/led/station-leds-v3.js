import fetch from 'node-fetch'
import { SetState } from '../../../hardware/io-expander/expander.js'

const LEDS = {
  GPS: 0,
  A: 10,
  B: 11,
}

class StationLeds {
  constructor() {
    this.internet_url = 'http://localhost:3000/modem/ppp'
    this.gps_delay_timeout = 60 * 1000 // if gps time > 60 seconds, turn off light
  }

  checkGps(gps_data) {
    if (!gps_data) {
      return false
    }
    let now = new Date()
    let gps_time = new Date(gps_data.time)
    let delta = now - gps_time
    if (delta > this.gps_delay_timeout) {
      return false
    }
    if (gps_data.mode == 3) {
      return true
    }
    return false
  }

  async checkInternet() {
    return fetch(this.internet_url)
      .then(res => res.json())
      .then(json => {
        if (json.ppp == true) {
          return true
        } else {
          return false
        }
      })
  }

  async toggleAll(gps) {
    let gps_status = this.checkGps(gps)
    let internet_status
    try {
      internet_status = await this.checkInternet()
    } catch (err) {
      console.log('unable to poll hardware server', this.internet_url)
      console.error(err)
      internet_status = false
    }
    let gps_state = gps_status ? 'high' : 'low'
    let internet_state = internet_status ? 'high' : 'low'
    let led_state = [{
      pin: LEDS.GPS,
      state: gps_state,
    }, {
      pin: LEDS.A,
      state: 'toggle',
    }, {
      pin: LEDS.B,
      state: internet_state
    }]
    await SetState(led_state)
    return
  }
}

export { StationLeds }

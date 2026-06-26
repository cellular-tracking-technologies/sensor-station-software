import { LedDriver } from './led-driver.js'
import fetch from 'node-fetch'

class StationLeds {
  constructor() {
    this.led_driver = new LedDriver()
    this.hardware_server = 'http://localhost:3000'
    this.ping_count = 3
    this.led_driver = new LedDriver()
    this.gps_delay_timeout = 60 * 1000 // 60 seconds for gps light to go out
  }

  async toggleGps(data) {
    if (data) {
      let now = new Date()
      let gps_time = new Date(data.time)
      let delta = now - gps_time
      if (delta > this.gps_delay_timeout) {
        this.led_driver.toggleGps({ state: 'off' })
      } else {
        switch (data.mode) {
          case 3:
            await this.led_driver.toggleGps({ state: 'on' })
            break
          case 2:
            await this.led_driver.toggleGps({ state: 'blink', blink_ms: 500 })
            break
          case 1:
            await this.led_driver.toggleGps({ state: 'blink', blink_ms: 200 })
            break
          default:
            await this.led_driver.toggelGps({ state: 'off' })
            break
        }
      }
    } else {
      await this.led_driver.toggleGps({ state: 'off' })
    }
  }

  async toggleInternet() {
    return fetch('http://localhost:3000/modem/ppp')
      .then(res => res.json())
      .then(json => {
        if (json.ppp == true) {
          this.led_driver.toggleDiagB({ state: 'on' })
        } else {
          this.led_driver.toggleDiagB({ state: 'off' })
        }
      })
      .catch((err) => {
        console.error(err)
        this.led_driver.toggleDiagB({ state: 'blink', blink_ms: 100 })
      })
  }

  async toggleOperational() {
    return this.led_driver.toggleDiagA({ state: 'toggle' })
  }

  async toggleAll(gps) {
    return Promise.all([
      this.toggleGps(gps),
      this.toggleOperational(),
      this.toggleInternet(),
    ])
  }
}

export { StationLeds }

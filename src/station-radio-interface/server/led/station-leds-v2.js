import { LedDriver } from './led-driver.js'
import fetch from 'node-fetch'

class StationLeds {
  constructor() {
    this.led_driver = new LedDriver()
    // A literal address, never a hostname. station-hardware-server binds
    // 127.0.0.1 only, and once the box has no non-loopback IPv4 left, glibc's
    // AI_ADDRCONFIG drops the v4 answer entirely and leaves ::1 — which nothing
    // listens on. Dialing the address removes the resolver from the path.
    this.hardware_server = 'http://127.0.0.1:3000'
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
    return fetch(`${this.hardware_server}/modem/ppp`)
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

  // allSettled, NOT all: these three are independent HTTP calls to the hardware
  // server, so when it is unreachable all three reject. Promise.all adopts the
  // FIRST rejection and leaves the other two unhandled — and Node >= 15 treats an
  // unhandled rejection as fatal, so the whole radio interface exits. systemd then
  // restarts it, it fails again ~3 s later, and data collection stops for as long
  // as the condition lasts (361,219 restarts over 13 days on 6CA25D375881,
  // 2026-09-05 to 09-18). Settling every promise keeps a cosmetic LED failure
  // cosmetic.
  async toggleAll(gps) {
    const results = await Promise.allSettled([
      this.toggleGps(gps),
      this.toggleOperational(),
      this.toggleInternet(),
    ])
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      const why = failed
        .map((r) => (r.reason && r.reason.message) || String(r.reason))
        .join('; ')
      console.error(`unable to toggle ${failed.length}/${results.length} LEDs: ${why}`)
    }
    return results
  }
}

export { StationLeds }

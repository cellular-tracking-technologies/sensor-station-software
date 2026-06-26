import fs from 'fs'
import fetch from 'node-fetch'

// V3 status LEDs are now actuated by the native ctt-leds daemon, which drives
// the SX1509B expander from the desired-state file /run/ctt/leds. This class
// keeps the decision logic (GPS fix, internet/ppp, alive heartbeat) and just
// writes that file — no in-process I2C / SetState anymore.
//
// File format (one key=value per line; states: on | off | blink[:ms]):
//   gps=on|off     a=blink     b=on|off
const LEDS_FILE = '/run/ctt/leds'

class StationLeds {
  constructor() {
    this.internet_url = 'http://localhost:3000/modem/ppp'
    this.gps_delay_timeout = 60 * 1000 // if gps time > 60 seconds, turn off light
  }

  checkGps(gps_data) {
    if (!gps_data) {
      return false
    }
    let delta = new Date() - new Date(gps_data.time)
    if (delta > this.gps_delay_timeout) {
      return false
    }
    return gps_data.mode == 3
  }

  async checkInternet() {
    return fetch(this.internet_url)
      .then(res => res.json())
      .then(json => json.ppp == true)
  }

  // Atomic write (temp + rename) so ctt-leds never reads a half-written file.
  write(states) {
    const body = `gps=${states.gps}\na=${states.a}\nb=${states.b}\n`
    try {
      fs.writeFileSync(`${LEDS_FILE}.tmp`, body)
      fs.renameSync(`${LEDS_FILE}.tmp`, LEDS_FILE)
    } catch (err) {
      // /run/ctt missing or not writable (e.g. ctt-leds not up yet) — ignore
    }
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
    // gps: solid on with a 3D fix; a (diag-A): blink = the alive heartbeat the
    // old code did via per-tick 'toggle'; b (diag-B): on when the PPP link is up.
    this.write({
      gps: gps_status ? 'on' : 'off',
      a: 'blink',
      b: internet_status ? 'on' : 'off',
    })
  }
}

export { StationLeds }

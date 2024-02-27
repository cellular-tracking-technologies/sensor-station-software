// import LCD from '/lib/ctt/sensor-station-software/src/station-lcd-interface/lcdi2c.js'
import WifiSignal from '../../hardware/wifi/wifi-signal.js'
import display from '/lib/ctt/sensor-station-software/src/station-lcd-interface/display-driver.js'
import { exec } from 'child_process'
import { Buffer } from 'node:buffer'


class WifiStrength extends WifiSignal {
  constructor() {
    super()
    this.header = "WiFi:"
    this.cmd = 'iwconfig | grep "Link Quality"'
    this.display = display
    // this.lcd = new LCD()
    // this.wifi = new WifiSignal()
  }
  loading() {
    return [this.header]
  }

  results() {
    return new Promise(async (resolve, reject) => {
      const percent = await this.getWifiSignal()
      resolve(percent)

    }).then(async (values) => {
      console.log('wifi strength values', values)
      let rows = [this.header]
      let bars
      if (values > 75) {

        // bar0 = String.fromCharCode(0xff, 0xff, 0xff, 0xff, 0xff)
        bars = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x03, 0x07, 0x0f, 0x1f], 'hex')
        await this.createChar(bars)
      } else if (values <= 75 && values > 50) {
        bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x02, 0x06, 0x0e, 0x1e], 'hex')
        await this.createChar(bars)

        console.log('med strength', rows)
      } else if (values <= 50 && values > 25) {
        bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x02, 0x04, 0x0c, 0x1c], 'hex')
        await this.createChar(bars)

        // rows.push(bar0)
        console.log('low strength', rows)
      } else if (values <= 25 && values > 0) {
        bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x18], 'hex')
        await this.createChar(bars)
        console.log('no strength', rows)
      } else {
        bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10], 'hex')
        await this.createChar(bars)
      }

      console.log('rows', rows)
      // return rows
    }).catch((e) => {
      console.error(e)
    })
  }

  async createChar(bars) {
    let arrByte = Uint8Array.from(bars)
    this.display.lcd.createChar(0, arrByte)
    this.display.lcd.setCursor(6, 0)
    this.display.lcd.print('\x00')
  }
}

export { WifiStrength }
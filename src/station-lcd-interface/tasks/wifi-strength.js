// import LCD from '/lib/ctt/sensor-station-software/src/station-lcd-interface/lcdi2c.js'
import WifiSignal from '../../hardware/wifi/wifi-signal.js'
import display from '/lib/ctt/sensor-station-software/src/station-lcd-interface/display-driver.js'
import { exec } from 'child_process'
import { Buffer } from 'node:buffer'


class WifiStrength extends WifiSignal {
  constructor() {
    super()
    this.header = "WiFi Signal Strength"
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

    }).then((values) => {
      console.log('wifi strength values', values)
      let rows = [this.header]
      let bar0, bar1, bar2
      if (values > 50) {

        // bar0 = String.fromCharCode(0xff, 0xff, 0xff, 0xff, 0xff)
        bar0 = Buffer.from([0x1f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f], 'hex')
        let arrByte = Uint8Array.from(bar0)

        this.display.lcd.createChar(0, arrByte)
        this.display.lcd.print('\x00')
        // this.display.lcd.setCursor(1, 0)
        // this.display.lcd.printlnBlock('hello world', 1)
        // this.display.writeRow('\x00', 2)
        // console.log('custom character', custom_char)
        // console.log('bar0 byte array', String.fromCharCode(custom_char))
        // rows.push(custom_char)

        console.log('high strength', rows)
        // } else if (values <= 75 && values > 50) {
        //   bar0 = Buffer.from([0x1f, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f], 'hex')
        //   console.log('bar0 data', bar0.toString())
        //   let arrByte = Uint8Array.from(bar0)
        //   console.log('bar0 byte array', String.fromCharCode(arrByte))
        //   rows.push('\u0001')

        //   console.log('med strength', rows)
        // } else if (values <= 50 && values > 25) {
        //   bar0 = String.fromCharCode(0xff, 0xff, 0xff, 0xff, 0xff)
        //   rows.push(bar0)
        //   console.log('low strength', rows)
        // } else if (values <= 25 && values > 0) {
        //   bars = 0x10
        //   console.log('no strength', rows)
      }

      console.log('rows', rows)
      // return rows
    }).catch((e) => {
      console.error(e)
    })
  }
}

export { WifiStrength }
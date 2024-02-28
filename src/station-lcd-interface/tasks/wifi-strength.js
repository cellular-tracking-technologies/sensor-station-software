import WifiSignal from '../../hardware/wifi/wifi-signal.js'
import display from '/lib/ctt/sensor-station-software/src/station-lcd-interface/display-driver.js'
import { Buffer } from 'node:buffer'
import fetch from 'node-fetch'
import url from 'url'

class WifiStrength extends WifiSignal {
  constructor(base_url, refresh = 5000) {
    super()
    console.log('base url', base_url)
    this.url = url.resolve(base_url, 'internet/wifi-strength')
    this.header = "WiFi:"
    this.autoRefresh = refresh
    // this.cmd = 'iwconfig | grep "Link Quality"'
    this.display = display

  }
  loading() {
    return [this.header]
  }

  results() {
    let rows = [this.header]

    return new Promise(async (resolve, reject) => {
      fetch(this.url)
        .then(data => {
          console.log('wifi strength fetch data', data)
          return data.json()
        })
        .then(async res => {
          console.log('wifi strength res', res.wifi_strength)
          let bars, chars
          let percent = res.wifi_strength
          rows.push(percent)
          // resolve(rows)
          // resolve([this.header, percent])

          // if (percent > 75) {

          //   bars = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x03, 0x07, 0x0f, 0x1f], 'hex')
          //   chars = await this.createChar(bars)
          //   resolve([this.header, chars])

          // } else if (percent <= 75 && percent > 50) {
          //   bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x02, 0x06, 0x0e, 0x1e], 'hex')
          //   chars = await this.createChar(bars)
          //   resolve([this.header, chars])

          //   console.log('med strength', rows)
          // } else if (percent <= 50 && percent > 25) {
          //   bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x02, 0x04, 0x0c, 0x1c], 'hex')
          //   resolve([this.header, await this.createChar(bars)])

          //   console.log('low strength', rows)
          // } else if (percent <= 25 && percent > 0) {
          //   bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x18], 'hex')
          //   resolve([this.header, await this.createChar(bars)])
          //   console.log('no strength', rows)
          // } else {
          //   bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10], 'hex')
          //   resolve([this.header, await this.createChar(bars)])
          // }
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
      resolve(rows)

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
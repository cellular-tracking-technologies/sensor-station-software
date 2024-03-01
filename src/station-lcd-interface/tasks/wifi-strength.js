import WifiSignal from '../../hardware/wifi/wifi-signal.js'
import display from '/lib/ctt/sensor-station-software/src/station-lcd-interface/display-driver.js'
import { Buffer } from 'node:buffer'
import fetch from 'node-fetch'
import url from 'url'

class WifiStrength extends WifiSignal {
  constructor(base_url, refresh = 5000) {
    super()
    this.url = url.resolve(base_url, 'internet/wifi-strength')
    this.header = "WiFi:"
    this.autoRefresh = refresh
    // this.cmd = 'iwconfig | grep "Link Quality"'
    this.display = display

  }
  loading() {
    return [this.header]
  }

  async results() {
    let rows = [this.header]

    return new Promise(async (resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(async res => {
          let percent = res.wifi_strength
          resolve(percent)
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }

  async createChar(bars) {
    let char = '\x00'
    let arrByte = Uint8Array.from(bars)
    this.display.lcd.createChar(0, arrByte)
    this.display.lcd.setCursor(0, 0)
    this.display.lcd.print(`wifi: ${char}`)
    return char
  }
}

export { WifiStrength }
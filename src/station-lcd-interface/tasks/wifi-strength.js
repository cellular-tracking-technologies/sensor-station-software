import os from 'os'
import command from '../../command.js'
command(`sudo raspi-config nonint do_wifi_ssid_passphrase ${data.ssid} ${data.psk} 0 1`)


class UsbWifiUploadTask {
  constructor() {
    this.header = "WiFi Signal"
  }
  loading() {
    return [this.header]
  }
  results() {
    return new Promise((resolve, reject) => {
      const regex = /(wlan\d+|eth\d+)/   // Match all 'eth' or 'wlan' interfaces
      var ifaces = os.networkInterfaces()

      let rows = [this.header]
      for (let [key, value] of Object.entries(ifaces)) {
        if (key.match(regex)) {
          const result = value.filter(element => (element.family == 'IPv4') && (element.internal == false))
          result.forEach(element => {
            rows.push(`${key} ${element.address}`)
          })
        }
      }
      resolve(rows)
    })
  }
}
import os from 'os'

class IpAddressTask {
  constructor() {
    this.header = "Ip Address"
    this.autoRefresh = 5000
  }
  loading() {
    return [this.header]
  }
  results() {
    return new Promise((resolve, reject) => {
      // Interfaces whose IP is worth showing on the front panel: wired (eth*),
      // WiFi (wlan*), and USB-ethernet dongles that don't enumerate as eth* —
      // predictable names (enx<mac>) or the legacy usb0. Anchored so we don't
      // match virtual interfaces that merely contain "eth" (e.g. veth*), and
      // deliberately NOT mdm0/ppp0 — the modem's 192.168.225.x is an internal
      // point-to-point NAT, not a reachable address.
      const regex = /^(eth\d+|wlan\d+|enx[0-9a-f]+|usb\d+)$/
      var ifaces = os.networkInterfaces()

      let rows = [this.header]
      for (let [key, value] of Object.entries(ifaces)) {
        if (key.match(regex)) {
          const result = value.filter(element => (element.family == 'IPv4') && (element.internal == false))
          result.forEach(element => {
            // eth0-style names fit "name ip" on one row; wlan/enx/usb names can
            // be long (enx<12 hex>), so give them their own row before the IP.
            if (/^eth\d+$/.test(key)) {
              rows.push(`${key} ${element.address}`)
            } else {
              rows.push(`${key}`)
              rows.push(`${element.address}`)
            }
          })
        }
      }
      resolve(rows)
    })
  }
}

export { IpAddressTask }
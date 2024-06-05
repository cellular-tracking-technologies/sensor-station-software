import WifiSignal from '../../hardware/pi/network/wifi-signal.js'
import display from '/lib/ctt/sensor-station-software/src/station-lcd-interface/display-driver.js'

class WifiStrength extends WifiSignal {
  constructor(base_url, refresh = 5000) {
    super()
    this.header = "WiFi:"
    this.autoRefresh = refresh
    this.display = display
  }
  loading() {
    return [this.header]
  }

  async results() {
    try {
      const { ssid, signal } = WifiSignal()
      console.log('got ssid, signal', ssid, signal)
      return signal
    } catch (err) {
      return [this.header, 'error']
    }
  }
}

export { WifiStrength }
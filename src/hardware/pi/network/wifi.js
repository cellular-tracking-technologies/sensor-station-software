import { execSync } from 'child_process'

export default Object.freeze({
  GetSignal: () => {
    // use nmcli to get signal percent of connected wifi
    const networks = execSync('nmcli -f IN-USE,SSID,SIGNAL dev wifi list').toString().trim()
    const network = {
      ssid: null,
      signal: null,
    }
    networks.split('\n').forEach((network) => {
      const [in_use, ssid, signal] = network.split()
      console.log(in_use, ssid, signal)
      if (in_use === '*') {
        // network is in use
        network.ssid = ssid,
          network.signal = signal
      }
    })
    return network
  },
  ScanNetworks: () => {

  }
})
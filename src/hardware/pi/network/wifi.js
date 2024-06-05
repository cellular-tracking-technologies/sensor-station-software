import { execSync } from 'child_process'

const GetNetworkList = () => {
  const network_info = execSync('nmcli -t -f IN-USE,SSID,SIGNAL device wifi list').toString().trim()
  return network_info.split('\n').map((info) => {
    const [in_use, ssid, signal] = info.split(':')
    return {
      connected: (in_use === '*') ? true : false,
      ssid,
      signal,
    }
  })
}

export default Object.freeze({
  GetSignal: () => {
    // return result
    GetNetworkList().find(network => network.connected ? true : false)
  },
  ScanNetworks: () => {
    return GetNetworkList()
  }
})
import { execSync } from 'child_process'

/**
 * 
 * @returns {Array}
 */
const GetNetworkList = () => {
  const network_info = execSync('nmcli -t -f IN-USE,SSID,SIGNAL,RATE,FREQ device wifi list').toString().trim()
  return network_info.split('\n').map((info) => {
    const [in_use, ssid, signal, rate, freq] = info.split(':')
    return {
      connected: (in_use === '*') ? true : false,
      ssid,
      signal: parseInt(signal),
      rate,
      freq
    }
  })
}

export default Object.freeze({
  /**
   * 
   * @returns {Object} return 
   */
  GetCurrentNetwork: () => {
    return GetNetworkList().find(network => network.connected)
  },
  /**
   * 
   * @returns {Array} array of networks visible to twifi
   */
  GetNetworks: () => {
    return GetNetworkList()
  }
})
import { execFile } from 'child_process'
import { promisify } from 'util'

const pExecFile = promisify(execFile)

/**
 * `nmcli device wifi list` can trigger a blocking rescan (seconds). Run it via
 * async execFile — never execSync — so a slow/hung scan can't freeze the event
 * loop of whatever imports this (the LCD interface's render loop, the hardware
 * server's request handling). A hard timeout caps a stuck nmcli.
 * @returns {Promise<Array>}
 */
const GetNetworkList = async () => {
  const { stdout } = await pExecFile(
    'nmcli',
    ['-t', '-f', 'IN-USE,SSID,SIGNAL,RATE,FREQ', 'device', 'wifi', 'list'],
    { encoding: 'utf8', timeout: 8000 }
  )
  return stdout.trim().split('\n').map((info) => {
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
   * @returns {Promise<Object>} return
   */
  GetCurrentNetwork: async () => {
    return (await GetNetworkList()).find(network => network.connected)
  },
  /**
   *
   * @returns {Promise<Array>} array of networks visible to twifi
   */
  GetNetworks: async () => {
    return GetNetworkList()
  }
})
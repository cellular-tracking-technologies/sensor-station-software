import { execFile } from 'child_process'
import { promisify } from 'util'

const pExecFile = promisify(execFile)

/**
 * Name of the currently-connected wifi device (usually wlan0, but don't
 * hardcode it), or null when no wifi device is connected. Used by the IP
 * lookup. Async execFile only — same event-loop-safety rationale as
 * GetNetworkList.
 * @returns {Promise<String|null>}
 */
const GetConnectedWifiDevice = async () => {
  const { stdout } = await pExecFile(
    'nmcli',
    ['-t', '-f', 'DEVICE,TYPE,STATE', 'device'],
    { encoding: 'utf8', timeout: 8000 }
  )
  const row = stdout.trim().split('\n')
    .map(line => line.split(':'))
    .find(([, type, state]) => type === 'wifi' && state === 'connected')
  return row ? row[0] : null
}

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

/**
 * IPv4 address of whichever wifi device is currently connected, or null.
 * Async execFile only — same event-loop-safety rationale as GetNetworkList.
 * @returns {Promise<String|null>}
 */
const GetCurrentIp = async () => {
  // Find the connected wifi device (usually wlan0, but don't hardcode it).
  const device = await GetConnectedWifiDevice()
  if (!device) return null
  const { stdout } = await pExecFile(
    'nmcli',
    ['-t', '-f', 'IP4.ADDRESS', 'device', 'show', device],
    { encoding: 'utf8', timeout: 8000 }
  )
  // Lines look like: IP4.ADDRESS[1]:192.168.1.5/24
  const line = stdout.trim().split('\n').find(Boolean)
  if (!line) return null
  const value = line.split(':').slice(1).join(':').trim() // 192.168.1.5/24
  return value ? value.split('/')[0] : null
}

export default Object.freeze({
  /**
   * The currently-connected wifi network (`signal` is the nmcli 0-100 percent),
   * or undefined when nothing is connected.
   * @returns {Promise<Object|undefined>} connected network, or undefined
   */
  GetCurrentNetwork: async () => {
    return (await GetNetworkList()).find(network => network.connected)
  },
  /**
   * @returns {Promise<String|null>} IPv4 address of the connected wifi device
   */
  GetCurrentIp,
  /**
   *
   * @returns {Promise<Array>} array of networks visible to twifi
   */
  GetNetworks: async () => {
    return GetNetworkList()
  }
})
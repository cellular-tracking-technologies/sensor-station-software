import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { promisify } from 'util'

const pExecFile = promisify(execFile)

/**
 * Name of the currently-connected wifi device (usually wlan0, but don't
 * hardcode it), or null when no wifi device is connected. Shared by the IP and
 * signal-dBm lookups. Async execFile only — same event-loop-safety rationale as
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
 * Signal level in dBm for the given wifi device, read from the kernel's
 * /proc/net/wireless (the `level` column). We read it here rather than shelling
 * out to `iw`/`iwconfig` because neither is installed on the station image,
 * whereas /proc/net/wireless is always present. Returns null when the device
 * has no row yet (adapter down / just associated) or the value can't be parsed;
 * callers can fall back to deriving dBm from the nmcli signal percent.
 * @param {String} device wifi interface name (e.g. wlan0)
 * @returns {Promise<Number|null>} dBm as a negative integer, or null
 */
const GetSignalDbm = async (device) => {
  if (!device) return null
  try {
    const txt = await readFile('/proc/net/wireless', 'utf8')
    // Rows look like: " wlan0: 0000   70.  -40.  -256        0 ..."
    // Columns after the "iface:" token are: status link level noise ...
    const line = txt.trim().split('\n')
      .find(l => l.trim().startsWith(`${device}:`))
    if (!line) return null
    const cols = line.trim().split(/\s+/)
    // cols[0]=`${device}:`, cols[1]=status, cols[2]=link, cols[3]=level(dBm)
    const level = parseFloat(cols[3]) // trailing '.' is tolerated by parseFloat
    return Number.isFinite(level) ? Math.round(level) : null
  } catch (err) {
    // /proc/net/wireless unreadable — non-fatal, fall back to percent-derived.
    return null
  }
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
   * The currently-connected wifi network, augmented with a real `dbm` signal
   * level from /proc/net/wireless (null when unavailable). `signal` remains the
   * nmcli 0-100 percent.
   * @returns {Promise<Object|undefined>} connected network, or undefined
   */
  GetCurrentNetwork: async () => {
    const current = (await GetNetworkList()).find(network => network.connected)
    if (!current) return current
    const device = await GetConnectedWifiDevice().catch(() => null)
    const dbm = await GetSignalDbm(device)
    return { ...current, dbm }
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
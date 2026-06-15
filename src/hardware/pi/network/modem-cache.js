// Adaptive modem-info cache.
//
// Pattern: on-demand polling with idle timeout.
//   - .get() returns the cached value AND stamps lastRequestedAt = now()
//   - A background timer ticks every POLL_INTERVAL_MS:
//       * if lastRequestedAt was within IDLE_TIMEOUT_MS  → poll mmcli, update cache
//       * otherwise                                       → stop polling + disable
//                                                           ModemManager extended signal
//                                                           reporting (signal-setup=0)
//   - The first .get() after idle kicks off a synchronous fetch so the caller
//     doesn't see stale data; subsequent rapid requests share the cache.
//
// Why: antenna-setup use case needs near-realtime data while someone is
// rotating the antenna, but the station otherwise sits idle for days. A
// forever-on poller wastes cycles + battery; pure on-demand makes the LCD
// fork mmcli every refresh. This sits in the middle: poll only when someone
// cares, stop when they don't.
//
// Signal data: when active, we also use `mmcli --signal-setup=N` to put
// ModemManager into extended-signal-reporting mode. That gives us real
// RSRP / RSRQ / SNR in dBm via `--signal-get`, vs reconstructing dBm from
// the coarse percent that the default signal-quality field exposes.

import { execFile } from 'child_process'
import { promisify } from 'util'

const pExecFile = promisify(execFile)

// Tunables. Defaults aim at "responsive during antenna setup, idle within
// a minute of nobody looking."
const POLL_INTERVAL_MS = 2000   // how often we re-poll while active
const IDLE_TIMEOUT_MS  = 60000  // no requests for this long → stop polling
const SIGNAL_SETUP_SEC = 2      // matches POLL_INTERVAL_MS for fresh RSRP

// Cache state — module-level singleton; one modem per station.
let cached = null
let lastFetchedAt = 0
let lastRequestedAt = 0
let pollTimer = null
let inFlight = null
let signalSetupOn = false

const getIndexFromPath = (path) => parseInt(path.split('/').pop())

// --- raw mmcli wrappers (async, non-blocking) -----------------------------

const mmcliJson = async (args) => {
  const { stdout } = await pExecFile('mmcli', ['-J', ...args])
  return JSON.parse(stdout)
}

const mmcliVoid = async (args) => {
  // For commands that don't return JSON (e.g. --signal-setup=N)
  await pExecFile('mmcli', args)
}

const findModemIndex = async () => {
  const info = await mmcliJson(['-L'])
  const path = info['modem-list'].shift()
  return path ? getIndexFromPath(path) : null
}

const fetchModemInfo = async (modemIdx) => mmcliJson(['-m', String(modemIdx)])
const fetchSimInfo   = async (modemIdx, simIdx) =>
  mmcliJson(['-m', String(modemIdx), '-i', String(simIdx)])
const fetchSignal    = async (modemIdx) =>
  mmcliJson(['-m', String(modemIdx), '--signal-get'])

const enableSignalSetup = async (modemIdx) => {
  if (signalSetupOn) return
  try {
    await mmcliVoid(['-m', String(modemIdx), `--signal-setup=${SIGNAL_SETUP_SEC}`])
    signalSetupOn = true
  } catch (err) {
    // Non-fatal — fall back to percent-derived RSSI.
    console.warn('modem-cache: signal-setup enable failed', err.message)
  }
}

const disableSignalSetup = async (modemIdx) => {
  if (!signalSetupOn) return
  try {
    await mmcliVoid(['-m', String(modemIdx), '--signal-setup=0'])
  } catch (err) {
    // Non-fatal.
  } finally {
    signalSetupOn = false
  }
}

// --- composite poll -------------------------------------------------------

// Pulls everything we publish from mmcli. Returns the shaped object the
// existing /modem consumers expect (same keys as the legacy modem.js info()),
// plus rsrp / rsrq / snr from --signal-get when available.
const pollOnce = async () => {
  const modemIdx = await findModemIndex()
  if (modemIdx === null) return null

  await enableSignalSetup(modemIdx)

  const [modemInfo, signalInfo] = await Promise.all([
    fetchModemInfo(modemIdx),
    fetchSignal(modemIdx).catch(() => null),  // signal-get can fail briefly
  ])

  const modem = modemInfo.modem
  const broadband = modem['3gpp']
  const generic = modem.generic
  const simPath = generic.sim
  const simIdx = getIndexFromPath(simPath)
  const simInfo = await fetchSimInfo(modemIdx, simIdx)
  const sim = simInfo.sim

  const sigPct = parseInt(generic['signal-quality'].value)
  // Legacy percent-derived dBm — keep for back-compat with existing consumers.
  const rssi = Math.floor(2 * ((sigPct * 31) / 100) - 113)

  // Extended signal — only present when MM has signal-setup enabled AND we're
  // currently on the relevant RAT. Pull LTE first, fall back to others.
  const sig = signalInfo && signalInfo.modem && signalInfo.modem.signal
  const lte = sig && sig.lte
  const rsrp = lte && lte.rsrp ? parseFloat(lte.rsrp) : null
  const rsrq = lte && lte.rsrq ? parseFloat(lte.rsrq) : null
  const snr  = lte && lte.snr  ? parseFloat(lte.snr)  : null

  return {
    signal: sigPct,
    imsi: sim.properties.imsi,
    imei: broadband.imei,
    sim: sim.properties.iccid,
    info: `${generic.model} - ${generic.revision}`,
    creg: broadband['registration-state'],
    carrier: broadband['operator-name'],
    access_tech: generic['access-technologies'],
    tower: broadband['operator-code'],
    state: generic.state,
    rssi: rssi.toString(),
    // New fields — null when MM signal-setup hasn't warmed up yet or we're
    // not on LTE. Consumers should treat these as optional.
    rsrp,
    rsrq,
    snr,
  }
}

// Dedup concurrent pollOnce calls — if a refresh is already running, return
// the same promise instead of starting a second.
const pollOnceDeduped = () => {
  if (inFlight) return inFlight
  inFlight = pollOnce()
    .then((info) => {
      cached = info
      lastFetchedAt = Date.now()
      return info
    })
    .catch((err) => {
      console.error('modem-cache: pollOnce failed', err.message)
      return cached  // serve stale on failure
    })
    .finally(() => { inFlight = null })
  return inFlight
}

// --- background tick ------------------------------------------------------

const tick = async () => {
  const now = Date.now()
  const active = (now - lastRequestedAt) < IDLE_TIMEOUT_MS

  if (active) {
    await pollOnceDeduped()
  } else {
    // Gone idle — let MM stop hammering the modem too.
    if (signalSetupOn) {
      const modemIdx = await findModemIndex().catch(() => null)
      if (modemIdx !== null) await disableSignalSetup(modemIdx)
    }
    stopPoller()
  }
}

const startPoller = () => {
  if (pollTimer) return
  pollTimer = setInterval(tick, POLL_INTERVAL_MS)
}

const stopPoller = () => {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
}

// --- public API -----------------------------------------------------------

// Returns the latest known modem info. If the cache is empty (cold start
// or post-idle wake-up), this awaits a fresh poll. Otherwise it returns
// cached data immediately. Either way it stamps "someone is interested"
// so the background poller keeps ticking.
const get = async () => {
  lastRequestedAt = Date.now()
  startPoller()

  const age = Date.now() - lastFetchedAt
  if (cached === null || age > IDLE_TIMEOUT_MS) {
    // Cold start or stale-after-idle — wait for a fresh fetch.
    return pollOnceDeduped()
  }
  return cached
}

export default { get }

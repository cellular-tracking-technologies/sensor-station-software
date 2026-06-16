// Adaptive cellular-connectivity probe.
//
// Pattern: on-demand probing with idle timeout — same shape as modem-cache.
//   - .get() returns { ppp, interface, ageMs } and stamps lastRequestedAt
//   - background timer pings through the modem interface every PROBE_INTERVAL_MS
//     while requests have been recent; goes idle after IDLE_TIMEOUT_MS of no
//     requests so we don't generate cellular traffic when nobody's looking
//   - .ppp is true only if a probe succeeded in the last FRESHNESS_MS
//
// Why this exists: the legacy /modem/ppp endpoint just checked whether ANY
// modem interface (wwan*/ppp*/mdm*) existed via `ifconfig`. With the Telit
// RNDIS path on an unprovisioned modem the mdm0 interface DOES come up, but
// the modem-side NAT refuses to forward to the LTE bearer — so the LED was
// showing "internet OK" for a station that couldn't reach anything. Probing
// settles the question: if 1.1.1.1 responds via the modem, internet works.
//
// Cost: 1 ICMP packet every 10s while the LED is polling = ~6 KB/min cellular
// data. Idle (LED not polling) = zero.

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'

const pExecFile = promisify(execFile)

// Tunables.
const PROBE_INTERVAL_MS = 10000   // re-probe every 10s while active
const FRESHNESS_MS = 30000        // .ppp=false if last success older than this (3 probe windows)
const IDLE_TIMEOUT_MS = 60000     // stop probing after this long without /ppp requests
const PROBE_TIMEOUT_S = 2         // ping -W timeout
const PROBE_TARGET = '1.1.1.1'    // Cloudflare DNS — tolerates aggressive ICMP

// Modem-interface candidates in priority order. mdm0 = Telit RNDIS (current
// branch), ppp0 = legacy Telit PPP, wwan0 = Quectel QMI. First one whose
// operstate is up wins; we re-check on every probe in case a hot-swap happened.
const CANDIDATE_INTERFACES = ['mdm0', 'ppp0', 'wwan0']

// State.
let lastSuccessAt = 0
let lastRequestedAt = 0
let probeTimer = null
let probeInFlight = false
let activeInterface = null

const pickInterface = async () => {
  for (const iface of CANDIDATE_INTERFACES) {
    try {
      const state = (await readFile(`/sys/class/net/${iface}/operstate`, 'utf8')).trim()
      // 'up' is the unambiguous case. 'unknown' shows up for some tunnel-style
      // interfaces (including RNDIS in some kernels) — treat it as "carrier
      // present" rather than rejecting it.
      if (state === 'up' || state === 'unknown') return iface
    } catch {
      // Interface doesn't exist on this station — try the next.
    }
  }
  return null
}

const probe = async () => {
  if (probeInFlight) return
  probeInFlight = true
  try {
    const iface = await pickInterface()
    if (!iface) {
      activeInterface = null
      return
    }
    activeInterface = iface
    await pExecFile('ping', [
      '-I', iface,
      '-c', '1',
      '-W', String(PROBE_TIMEOUT_S),
      '-q',
      PROBE_TARGET,
    ])
    lastSuccessAt = Date.now()
  } catch {
    // Probe failed — leave lastSuccessAt alone. Staleness vs FRESHNESS_MS
    // will cause subsequent .get() calls to report ppp=false.
  } finally {
    probeInFlight = false
  }
}

const tick = async () => {
  const idle = (Date.now() - lastRequestedAt) >= IDLE_TIMEOUT_MS
  if (idle) {
    stopPoller()
    return
  }
  await probe()
}

const startPoller = () => {
  if (probeTimer) return
  probeTimer = setInterval(tick, PROBE_INTERVAL_MS)
  // Fire an immediate probe so the first request after wake-up doesn't have
  // to wait a full PROBE_INTERVAL_MS for usable data.
  probe()
}

const stopPoller = () => {
  if (!probeTimer) return
  clearInterval(probeTimer)
  probeTimer = null
}

// Public API. Returns:
//   { ppp: boolean, interface: string|null, ageMs: number|null }
// where .ppp is true iff a probe succeeded within FRESHNESS_MS.
const get = async () => {
  lastRequestedAt = Date.now()
  startPoller()
  const ageMs = lastSuccessAt > 0 ? Date.now() - lastSuccessAt : null
  return {
    ppp: ageMs !== null && ageMs < FRESHNESS_MS,
    interface: activeInterface,
    ageMs,
  }
}

export default { get }

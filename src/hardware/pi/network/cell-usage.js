// Cumulative cellular data-usage accounting.
//
// Answers "how much data has this station sent/received over the modem" — a
// question nothing on the station could answer before: the kernel byte counters
// in /sys/class/net/<iface>/statistics/ reset every time the interface is
// created, which on these stations means every boot AND every modem
// re-enumeration. Read raw, they badly under-report.
//
// This module turns those resettable counters into a MONOTONIC total by
// accumulating deltas across interface lifetimes ("epochs") and persisting the
// running total to /var/lib/ctt/cell-usage.json.
//
// Why sysfs and not ModemManager bearer stats: MM exposes per-bearer byte
// counters, but only when it owns the data plane. On the Telit CDC-ECM path it
// does NOT — the modem is a router doing its own DHCP, mdm0 is brought up by
// modem-ecm-up.sh, and `mmcli -m 0` reports NO bearer object at all (verified on
// V3 station V3033D413FBC, 1bc7:7021, 2026-08-03). Quectel/QMI does have a
// bearer, so MM stats would work there — but sysfs works on BOTH, so it is the
// only source that can give one consistent number across the fleet.
//
// Deliberately clock-free. Stations boot with a bogus clock (observed:
// 2000-01-01 after a hard power cut, 2026-04-16 after a soft reboot) until
// chrony steps it, so anything bucketed by local wall-clock time lands in the
// wrong day — or the wrong decade. We therefore report only monotonic
// cumulative counters and let the CLOUD difference successive check-ins to
// derive per-day/per-month usage against a timestamp it can actually trust.

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { join } from 'path'

const pExecFile = promisify(execFile)

// Persistent state. MUST NOT live under /run — that is tmpfs and is wiped every
// boot, which is exactly the reset problem this module exists to solve.
const STATE_DIR = '/var/lib/ctt'
const STATE_FILE = join(STATE_DIR, 'cell-usage.json')
const STATE_VERSION = 1

// Fallback interface names, in priority order, used only when ModemManager
// cannot tell us (MM stopped, or a PPP path MM doesn't own):
//   mdm0  — BOTH Telit compositions. 78-ctt-telit-net.rules renames the netdev
//           to mdm0 for 1bc7:7021 (ECM, cdc_ether) and 1bc7:7020 (RNDIS,
//           rndis_host), so one name covers both Telit data paths.
//   wwan0 — Quectel EC25 (2c7c:0125, qmi_wwan). No udev rename; this is the
//           kernel's native name.
//   ppp0  — legacy PPP. Created by pppd, not ModemManager, so the MM lookup
//           below will never find it; this entry is why the fallback must exist.
//
// Deliberately NOT detected by driver name. `cdc_ncm` and `cdc_ether` are
// cellular modem drivers, but on these stations the USB *wired ethernet* dongle
// is also cdc_ncm (verified on V3033D413FBC: eth0 driver=cdc_ncm, mdm0
// driver=cdc_ether). Matching on driver would bill wired traffic as cellular.
const CANDIDATE_INTERFACES = ['mdm0', 'wwan0', 'ppp0']

const SAMPLE_INTERVAL_MS = 60000    // sysfs read — no cellular traffic, so sample freely
const PERSIST_INTERVAL_MS = 300000  // throttle eMMC writes (flash wear); epoch changes flush immediately
const MM_RECHECK_MS = 600000        // re-ask ModemManager which netdev is the modem's
const MMCLI_TIMEOUT_MS = 5000       // never let a wedged mmcli stall sampling

// In-memory authority. Persisted copy trails by at most PERSIST_INTERVAL_MS.
let state = {
  version: STATE_VERSION,
  total: { rx: 0, tx: 0 },   // monotonic, across all epochs, since first run
  epoch: null,               // { iface, ifindex, rx, tx } — last raw sample of the live interface
  epochs: 0,                 // how many distinct interface instances we've accounted
}
let loaded = false
let lastPersistAt = 0
let sampleTimer = null
let sampling = false

const readCounter = async (iface, name) => {
  const raw = await readFile(`/sys/class/net/${iface}/statistics/${name}`, 'utf8')
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(n) ? n : null
}

const ifaceExists = async (iface) => {
  try {
    await readFile(`/sys/class/net/${iface}/ifindex`, 'utf8')
    return true
  } catch {
    return false
  }
}

// Ask ModemManager which netdev belongs to the modem. This is the only
// family- and version-agnostic answer: MM reports the net port for BOTH the
// Telit ECM path (`ports: ["mdm0 (net)", "ttyACM5 (at)"]`) and Quectel QMI
// (`["cdc-wdm0 (qmi)", "wwan0 (net)"]`), so we never have to infer the family.
//
// It also survives the failure the udev rule itself warns about: if the rename
// to mdm0 races or does not fire, the Telit netdev lands as ethN or wwanN. MM
// still names it correctly, whereas a hardcoded list would either miss it or —
// worse, for ethN — collide with real Ethernet.
const modemManagerNetPort = async () => {
  const { stdout: listOut } = await pExecFile('mmcli', ['-J', '-L'], { timeout: MMCLI_TIMEOUT_MS })
  const modems = JSON.parse(listOut)?.['modem-list'] ?? []
  if (modems.length === 0) return null
  const index = modems[0].split('/').pop()
  const { stdout: modemOut } = await pExecFile('mmcli', ['-J', '-m', index], { timeout: MMCLI_TIMEOUT_MS })
  const ports = JSON.parse(modemOut)?.modem?.generic?.ports ?? []
  for (const port of ports) {
    const match = /^(\S+)\s+\(net\)$/.exec(port)
    if (match) return match[1]
  }
  return null
}

// Cache the resolved name so steady-state sampling stays a pure sysfs read —
// forking mmcli every SAMPLE_INTERVAL_MS would be wasteful. Re-resolve when the
// interface disappears or MM_RECHECK_MS has elapsed (catches a modem swap).
let cachedIface = null
let cachedIfaceAt = 0
let cachedSource = null

const resolveIface = async () => {
  const fresh = Date.now() - cachedIfaceAt < MM_RECHECK_MS
  if (cachedIface && fresh && await ifaceExists(cachedIface)) return cachedIface

  let iface = null
  try {
    iface = await modemManagerNetPort()
  } catch {
    // mmcli missing, ModemManager stopped, or malformed JSON — fall through.
  }
  if (iface && await ifaceExists(iface)) {
    cachedIface = iface
    cachedIfaceAt = Date.now()
    cachedSource = 'modemmanager'
    return iface
  }

  for (const candidate of CANDIDATE_INTERFACES) {
    if (await ifaceExists(candidate)) {
      cachedIface = candidate
      cachedIfaceAt = Date.now()
      cachedSource = 'name-fallback'
      return candidate
    }
  }

  cachedIface = null
  cachedSource = null
  return null
}

// Read the modem interface's counters plus its ifindex.
//
// ifindex is the reset detector. A "current < previous" check alone is not
// enough: if the interface is recreated and immediately passes more traffic than
// the old instance had, the counter never appears to go backwards and the reset
// is missed. The kernel allocates a fresh, higher ifindex every time the netdev
// is created, so (iface, ifindex) uniquely identifies one counter lifetime.
//
// We do NOT filter on operstate: a down-but-present interface still holds valid
// counters we must account for before it disappears.
const readInterface = async () => {
  const iface = await resolveIface()
  if (!iface) return null
  try {
    const [rx, tx, ifindexRaw] = await Promise.all([
      readCounter(iface, 'rx_bytes'),
      readCounter(iface, 'tx_bytes'),
      readFile(`/sys/class/net/${iface}/ifindex`, 'utf8'),
    ])
    if (rx === null || tx === null) return null
    return { iface, ifindex: Number.parseInt(ifindexRaw.trim(), 10), rx, tx }
  } catch {
    return null
  }
}

const loadState = async () => {
  if (loaded) return
  loaded = true
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, 'utf8'))
    // Only adopt state we understand. A version bump means the on-disk shape
    // changed; starting over loses history but can never corrupt the total.
    if (parsed?.version === STATE_VERSION && parsed?.total) {
      state = {
        version: STATE_VERSION,
        total: { rx: Number(parsed.total.rx) || 0, tx: Number(parsed.total.tx) || 0 },
        epoch: parsed.epoch ?? null,
        epochs: Number(parsed.epochs) || 0,
      }
    }
  } catch {
    // No state file yet (first run) or unreadable/corrupt JSON — start from zero.
    // Deliberately non-fatal: usage accounting must never break /modem.
  }
}

// Atomic write: temp file then rename. A hard power cut mid-write would
// otherwise leave truncated JSON — the same failure mode that once zeroed the
// checkout and is why update-station.sh calls sync. rename(2) is atomic on ext4,
// so a reader sees either the old file or the new one, never a partial one.
const persist = async (force = false) => {
  const now = Date.now()
  if (!force && now - lastPersistAt < PERSIST_INTERVAL_MS) return
  lastPersistAt = now
  try {
    await mkdir(STATE_DIR, { recursive: true })
    const tmp = `${STATE_FILE}.tmp`
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(tmp, STATE_FILE)
  } catch {
    // Disk full / read-only root — keep counting in memory rather than throwing.
  }
}

const sample = async () => {
  if (sampling) return
  sampling = true
  try {
    await loadState()
    const now = await readInterface()
    if (!now) return   // no modem interface present; nothing to account

    const prev = state.epoch
    const sameEpoch = prev && prev.iface === now.iface && prev.ifindex === now.ifindex

    let newEpoch = false
    if (!sameEpoch) {
      // First sample ever, or the interface was recreated / the modem family
      // changed. This counter started at 0 and now reads `now`, so ALL of it is
      // traffic we have not yet accounted.
      state.total.rx += now.rx
      state.total.tx += now.tx
      state.epochs += 1
      newEpoch = true
    } else if (now.rx < prev.rx || now.tx < prev.tx) {
      // Same interface instance but the counter regressed — shouldn't happen on
      // 64-bit counters. Treat it as a reset and take the current value whole
      // rather than adding a negative delta.
      state.total.rx += now.rx
      state.total.tx += now.tx
      newEpoch = true
    } else {
      state.total.rx += now.rx - prev.rx
      state.total.tx += now.tx - prev.tx
    }

    state.epoch = now
    // Flush epoch transitions immediately: they are the moments where losing
    // in-memory state would silently drop a whole interface lifetime.
    await persist(newEpoch)
  } catch {
    // Never let accounting break the caller.
  } finally {
    sampling = false
  }
}

// Sampling is a pair of sysfs reads — no cellular traffic, unlike
// connectivity-probe's ICMP. So unlike that module we do NOT stop when idle:
// going quiet would let an interface epoch appear and vanish between check-ins
// (every 6 h by default), losing its traffic entirely.
const startSampler = () => {
  if (sampleTimer) return
  sampleTimer = setInterval(sample, SAMPLE_INTERVAL_MS)
  if (typeof sampleTimer.unref === 'function') sampleTimer.unref()
}

// Public API. Returns:
//   {
//     interface: string|null,       // live modem netdev, or null if none present
//     source: 'modemmanager'|'name-fallback'|null,   // how it was identified
//     total: { rx, tx },            // MONOTONIC cumulative bytes since first run
//     session: { rx, tx },          // raw counters for the current interface instance
//     epochs: number,               // interface lifetimes accounted (reset count + 1)
//     stateFile: string,
//   }
// `total` is the number to trend. Difference it between two check-ins, server
// side, to get usage over that window — the station's own clock is not
// trustworthy enough to bucket by (see the header note).
const get = async () => {
  startSampler()
  await sample()
  return {
    interface: state.epoch?.iface ?? null,
    source: cachedSource,
    total: { ...state.total },
    session: state.epoch ? { rx: state.epoch.rx, tx: state.epoch.tx } : { rx: 0, tx: 0 },
    epochs: state.epochs,
    stateFile: STATE_FILE,
  }
}

export default { get }

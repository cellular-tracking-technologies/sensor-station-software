import { execSync } from 'child_process'
import os from 'os'
import fs from 'fs'

const getDiskUsage = () => {
  const buffer = execSync('df').toString()
  const lines = buffer.split('\n')
  const root = lines.find(line => line.indexOf('/dev/root') >= 0)
  const vals = root.split(/\s+/)
  const space_total = parseInt(vals[1])
  const space_available = parseInt(vals[3])
  return {
    total: space_total,
    available: space_available
  }
}

// Raspberry Pi PMIC throttle / under-voltage flags.
//
// Why this is here: the "has occurred" bits (16-19) LATCH for the life of the boot. That
// is what makes this a brownout DETECTOR rather than a sample — a rail sag far too brief
// to leave a kernel message, or to be caught by any poll, still sets the sticky bit and
// stays set until reboot. Nothing else on the station can see a transient like that:
// ctt-sensors reads the 24 V battery at ~5-minute resolution, not the 5 V rail.
//
//   bit 0  under-voltage now           bit 16  under-voltage HAS OCCURRED
//   bit 1  arm frequency capped now    bit 17  arm frequency capping has occurred
//   bit 2  currently throttled         bit 18  throttling has occurred
//   bit 3  soft temp limit now         bit 19  soft temp limit has occurred
//
// Added for investigations/2026-08-27 (V30B0154C65F): a Telit module rebooted itself and
// stranded the station ~22 h, every AT-reachable cause was eliminated, and a power
// transient could be neither confirmed nor ruled out because no rail telemetry existed.
// Reporting this per checkin means the next occurrence is answerable.
const getThrottled = () => {
  try {
    const raw = execSync('vcgencmd get_throttled', { timeout: 2000 }).toString().trim()
    const match = raw.match(/throttled=(0x[0-9a-fA-F]+)/)
    if (!match) return null
    const bits = parseInt(match[1], 16)
    return {
      raw: match[1],
      undervoltage_now: Boolean(bits & (1 << 0)),
      throttled_now: Boolean(bits & (1 << 2)),
      undervoltage_since_boot: Boolean(bits & (1 << 16)),
      throttled_since_boot: Boolean(bits & (1 << 18)),
    }
  } catch (err) {
    // vcgencmd missing, not permitted, or a non-Pi host. Fail SOFT and deliberately:
    // /about is fetched by base-station.js to build the cloud checkin, so an optional
    // diagnostic field must never be able to break check-ins.
    return null
  }
}

const SoftwareUpdateFile = '/etc/ctt/station-software'

export default Object.freeze(() => {
  const software_update = fs.readFileSync(SoftwareUpdateFile).toString().trim()
  const disk_usage = getDiskUsage()
  return {
    software_update,
    disk_usage,
    loadavg_15min: os.loadavg()[2],
    free_mem: os.freemem(),
    total_mem: os.totalmem(),
    uptime: os.uptime(),
    throttled: getThrottled(),
  }
})
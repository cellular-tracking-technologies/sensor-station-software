// Turn an unhandled promise rejection into a labelled, greppable crash
// (side-effect import).
//
// Node >= 15 defaults to --unhandled-rejections=throw: a rejection with no
// handler becomes an uncaught exception and the process exits. Nothing in this
// tree installed a handler, so such a failure surfaced only as a bare stack
// trace that reads like an unrelated crash, and the service simply vanished.
// Two instances that did exactly that:
//
//   * ServerApi.pollSensors() -- `fetch(uri).then(...)` with no .catch, fired
//     every sensor_data_frequency_minutes (60), so an unreachable
//     station-hardware-server took down station-radio-interface hourly.
//   * the icmp ping in hardware/pi/network/connection.js -- no .catch, and
//     inside a `new Promise` executor, so it killed station-hardware-server
//     AND left the /internet/status request hanging.
//
// This does NOT change availability. We still exit non-zero, so each unit's
// Restart=on-failure (with StartLimitIntervalSec=0 -- retry forever, never
// systemd's give-up-after-5) brings the service back exactly as before. What it
// adds is one line naming the script and the rejection, written synchronously
// so journald has it before the process goes away:
//
//   journalctl -u 'station-*' | grep CTT-UNHANDLED-REJECTION
//
// Deliberately scoped to unhandledRejection only. uncaughtException is left on
// Node's default so ordinary programming errors keep their full stack trace and
// their existing crash semantics.
//
// Import this early in each service entry point, alongside prefer-ipv4.js.
import fs from 'node:fs'

const TAG = 'CTT-UNHANDLED-REJECTION'

process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error
    ? (reason.stack || `${reason.name}: ${reason.message}`)
    : String(reason)

  try {
    // writeSync, not console.error: stderr may be a pipe, and process.exit()
    // discards whatever is still queued on an asynchronous write.
    fs.writeSync(2, `${new Date().toISOString()} ${TAG} ${process.argv[1]}: ${detail}\n`)
  } catch (err) {
    // never let the crash reporter be the thing that crashes
  }

  process.exit(1)
})

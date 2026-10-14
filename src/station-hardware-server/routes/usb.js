import express from 'express'
import fs from 'fs'
import { UsbStorage } from '../../usb-storage-driver/index.js'
import CopyQueue from '../../usb-storage-driver/copy-queue.js'
import drivelist from 'drivelist'
import command from '../../command.js'

const router = express.Router()

const usb = new UsbStorage()
const USB_MOUNT_POINT = '/mnt/usb'

// Hard ceiling on a single copy run. CopyQueue enforces this internally, and
// additionally bounds every individual file — so a wedged write fails that one
// file rather than hanging the whole download until a service restart.
const COPY_TOTAL_DEADLINE_MS = 20 * 60 * 1000

let mountInProgress = false
// The active CopyQueue, or null when no copy is running. This single reference
// replaces the old copyInProgress / copySession / copyProgress trio: the queue
// object *is* the session, so a late callback from an aborted run cannot stomp on
// a newer one, and progress is read straight off it.
let copyQueue = null

// true iff /mnt/usb is a real mountpoint (different filesystem from /mnt).
function isUsbMounted() {
  try {
    return fs.statSync(USB_MOUNT_POINT).dev !== fs.statSync('/mnt').dev
  } catch (e) {
    return false
  }
}

/* GET home page. */
router.get('/', function (req, res, next) {
  drivelist.list()
    .then((devices) => {
      res.json(devices.filter(device => { return device.busType == 'USB' }))
    }).catch((error) => {
      res.json(null)
    })
})

const success = { status: "success" }
const fail = { status: "fail" }

/**
 * mount USB drive to /mnt/usb
 */
router.get('/mount', (req, res) => {
  if (mountInProgress) {
    console.log('hardware-server USB mount already in progress, ignoring duplicate request')
    res.json({ status: "busy" })
    return
  }
  mountInProgress = true
  usb.mount()
    .then(() => {
      res.json(success)
    }).catch((err) => {
      console.log('hardware-server USB mount error')
      console.error(err)
      res.json(fail)
    }).finally(() => {
      mountInProgress = false
    })
})

/**
 * unmount USB drive at /mnt/usb
 */
router.get('/unmount', (req, res) => {
  usb.unmount()
    .then(() => {
      res.json(success)
    }).catch((err) => {
      console.log('hardware-server USB umount error')
      console.error(err)
      res.json(fail)
    })
})

/**
 * report copy progress as file counts, plus the phase label the LCD renders
 * ('paused', 'rotating', 'restarting'). Read from the queue's in-memory counters,
 * so this never touches the USB volume — a faulted stick can't make this hang.
 */
router.get('/data/progress', (req, res) => {
  if (!copyQueue) {
    res.json({ status: "idle", phase: null, total: 0, copied: 0 })
    return
  }
  res.json(copyQueue.snapshot())
})

/**
 * pause an in-flight copy between files, so another service can touch /data
 * without racing the copy. `phase` labels why, for the front-panel display:
 *   POST /usb/data/pause?phase=paused    -> LCD "Data Paused"
 *   POST /usb/data/pause?phase=rotating  -> LCD "Data Rotating"
 *
 * Idempotent, and safe to call when nothing is copying (answers `idle`). The
 * caller is not required to resume: a pause self-releases inside the queue after
 * MAX_PAUSE_MS so a crashed pauser cannot strand a download.
 */
router.post('/data/pause', async (req, res) => {
  if (!copyQueue) {
    res.json({ status: "idle", paused: false })
    return
  }
  const phase = (req.query.phase || 'paused').toString()
  const queue = copyQueue
  queue.pause(phase)

  // A pause takes effect BETWEEN files, so the file already in flight finishes
  // first. Wait briefly for it so a `paused` answer means "nothing is being
  // written", not merely "asked to stop" — the caller is about to move files
  // around in the source tree. Bounded well under the caller's ack timeout; if a
  // file is genuinely wedged we answer anyway and let its per-file ceiling deal
  // with it.
  const quiesce_deadline = Date.now() + 1000
  while (queue.current_file && Date.now() < quiesce_deadline) {
    await new Promise((r) => setTimeout(r, 50))
  }

  res.json({ ...queue.snapshot(), quiesced: queue.current_file === null })
})

/**
 * resume a paused copy. The queue reports phase 'restarting' for a few seconds
 * afterwards so the LCD's 2-second poll still catches the restart banner.
 */
router.post('/data/resume', (req, res) => {
  if (!copyQueue) {
    res.json({ status: "idle", paused: false })
    return
  }
  copyQueue.resume()
  res.json(copyQueue.snapshot())
})

/**
 * copy data files from station to USB
 *
 * Guarded by three watchdogs:
 *   1. mountpoint precheck — refuse to start if /mnt/usb isn't actually mounted
 *   2. stall watchdog       — abort if `copied` doesn't increase for COPY_STALL_MS
 *   3. total deadline       — abort if the operation exceeds COPY_TOTAL_DEADLINE_MS
 *
 * Each copy is tagged with a `mySession` token; late ncp callbacks from a
 * watchdog-aborted copy are no-ops (they would otherwise stomp on a newer
 * copy's module-level state).
 */
router.get('/data', async (req, res, next) => {
  if (copyQueue) {
    console.log('hardware-server USB data copy already in progress, ignoring duplicate request')
    res.json({ status: "busy" })
    return
  }
  if (!isUsbMounted()) {
    console.log(`hardware-server USB data copy refused — ${USB_MOUNT_POINT} is not mounted`)
    res.json({ status: "no-mount" })
    return
  }

  const queue = new CopyQueue({
    src: "/data",
    dest: USB_MOUNT_POINT,
    deadlineMs: COPY_TOTAL_DEADLINE_MS,
  })
  copyQueue = queue
  // leave the queue's own deadline to fire first; the HTTP socket gets slack.
  req.setTimeout(COPY_TOTAL_DEADLINE_MS + 60 * 1000)

  const total = queue.enumerate()
  console.log(`hardware-server USB data copy started from /data to USB (${total} files)`)

  try {
    const result = await queue.run()
    console.log(
      `hardware-server USB data copy ${result.status} — ` +
      `${result.copied}/${result.total} files (${result.skipped} already present, ` +
      `${result.failed.length} failed) in ${result.elapsed_s}s`
    )

    if (result.status === 'done' && result.failed.length === 0) {
      res.json(success)
    } else if (result.status === 'stalled' || result.status === 'timeout') {
      // The volume stopped accepting writes. Unmount so the next attempt starts
      // from a clean mount rather than inheriting wedged descriptors.
      usb.unmount()
        .then(() => console.log(`hardware-server unmounted ${USB_MOUNT_POINT} after ${result.status}`))
        .catch((err) => console.log(`hardware-server unmount-after-${result.status} failed:`, err.message || err))
      res.json({ status: result.status, copied: result.copied, total: result.total })
    } else {
      res.json({ status: "partial", copied: result.copied, total: result.total, failed: result.failed.length })
    }
  } catch (err) {
    console.log('hardware-server USB data copy error', err)
    res.json(fail)
  } finally {
    // Only clear the module reference if a newer copy hasn't already claimed it.
    if (copyQueue === queue) copyQueue = null
  }
})

/**
 * load WiFi credentials from USB mount point
 * overwrite wpa_supplicant file
 */
router.get('/wifi', async function (req, res, next) {
  const path = "/mnt/usb/wifi/credentials.json"
  let response = fail

  if (fs.existsSync(path)) {
    try {
      // load JSON file with credentials
      const data = JSON.parse(fs.readFileSync(path, 'utf8'))

      // Bring the connection up and WAIT for it. `nmcli dev wifi connect` creates
      // the connection profile (named after the SSID) and activates it; awaiting
      // means we only touch that profile after it exists, and a failure (SSID out
      // of range, bad password, driver issue) rejects into the catch below.
      //
      // These two commands were previously fired without `await`, so the ipv4
      // tweak raced ahead of the profile creation and rejected with "unknown
      // connection"; that unhandled rejection crashed the hardware server, which
      // in turn aborted the in-flight connect. Serializing them fixes both.
      if (data.hasOwnProperty("psk")) {
        await command(`sudo nmcli dev wifi connect "${data.ssid}" password "${data.psk}"`)
      } else {
        await command(`sudo nmcli dev wifi connect "${data.ssid}"`)
      }
      // Profile now exists — ensure it uses DHCP (the nmcli default for a new
      // wifi connection; set explicitly to be safe).
      await command(`sudo nmcli c mod "${data.ssid}" ipv4.method auto`)

      response = success
    } catch (err) {
      // Report the real outcome instead of crashing or falsely returning success.
      console.log('something went wrong adding wifi network')
      console.log(err)
      response = fail
    }
  } else {
    console.log('hardware-server WiFi crendentials path does not exist', path)
    console.log('obtaining WiFi credentials from raspberry pi')

  }
  res.json(response)
  console.log('usb response', response, 'connecting to internet')
})

export default router
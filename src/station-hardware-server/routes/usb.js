import express from 'express'
import fs from 'fs'
import { UsbStorage } from '../../usb-storage-driver/index.js'
import drivelist from 'drivelist'
import command from '../../command.js'

const router = express.Router()

const usb = new UsbStorage()
const USB_MOUNT_POINT = '/mnt/usb'

// total ceiling on any single copy operation. If ncp hasn't called back by
// then, the watchdog forces the in-progress flag clear so the station can
// recover without a service restart.
const COPY_TOTAL_DEADLINE_MS = 20 * 60 * 1000
// inactivity watchdog. If `copied` hasn't increased in this many ms, declare
// the copy stalled and abort. Catches ncp callback races (e.g. when a source
// file rotates out from under the walk).
const COPY_STALL_MS = 5 * 60 * 1000
// how often the stall watchdog samples the file count.
const COPY_PROGRESS_SAMPLE_MS = 30 * 1000

let mountInProgress = false
let copyInProgress = false
let copySession = 0
let copyProgress = { total: 0, baselineFiles: 0, lastCopiedCount: 0, lastIncreaseAt: 0 }

function countFiles(dir) {
  let count = 0
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) {
        count++
      } else if (entry.isDirectory()) {
        count += countFiles(`${dir}/${entry.name}`)
      }
    }
  } catch (e) { /* directory may not exist yet */ }
  return count
}

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
 * report copy progress as file counts
 */
router.get('/data/progress', (req, res) => {
  if (!copyInProgress) {
    res.json({ status: "idle", total: 0, copied: 0 })
    return
  }
  const copied = countFiles("/mnt/usb") - copyProgress.baselineFiles
  res.json({ status: "copying", total: copyProgress.total, copied: Math.max(copied, 0) })
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
router.get('/data', (req, res, next) => {
  if (copyInProgress) {
    console.log('hardware-server USB data copy already in progress, ignoring duplicate request')
    res.json({ status: "busy" })
    return
  }
  if (!isUsbMounted()) {
    console.log(`hardware-server USB data copy refused — ${USB_MOUNT_POINT} is not mounted`)
    res.json({ status: "no-mount" })
    return
  }

  copyInProgress = true
  const mySession = ++copySession
  copyProgress.total = countFiles("/data")
  copyProgress.baselineFiles = countFiles(USB_MOUNT_POINT)
  copyProgress.lastCopiedCount = 0
  copyProgress.lastIncreaseAt = Date.now()
  // leave the watchdogs to fire first; HTTP socket gets a little extra slack.
  req.setTimeout(COPY_TOTAL_DEADLINE_MS + 60 * 1000)
  const startTime = Date.now()
  console.log(`hardware-server USB data copy started from /data to USB (${copyProgress.total} files)`)

  let responseSent = false
  const sendOnce = (body) => {
    if (responseSent) return
    responseSent = true
    res.json(body)
  }

  // Tear down module-level state for *this* session only. A watchdog-aborted
  // copy whose ncp callback arrives late will see mySession !== copySession
  // and bail before reaching this branch.
  const finish = (body) => {
    if (mySession === copySession) {
      clearInterval(stallInterval)
      clearTimeout(totalDeadline)
      copyInProgress = false
    }
    sendOnce(body)
  }

  // When a watchdog aborts, ncp is still running in the background and will
  // keep writing to /mnt/usb. Unmounting forces those writes to fail, which
  // typically convinces ncp to release file handles and call its callback.
  const abortByUnmount = (reason) => {
    usb.unmount()
      .then(() => console.log(`hardware-server unmounted ${USB_MOUNT_POINT} after ${reason}`))
      .catch((err) => console.log(`hardware-server unmount-after-${reason} failed:`, err.message || err))
  }

  const stallInterval = setInterval(() => {
    if (mySession !== copySession) return
    const copied = Math.max(countFiles(USB_MOUNT_POINT) - copyProgress.baselineFiles, 0)
    if (copied > copyProgress.lastCopiedCount) {
      copyProgress.lastCopiedCount = copied
      copyProgress.lastIncreaseAt = Date.now()
      return
    }
    if (Date.now() - copyProgress.lastIncreaseAt > COPY_STALL_MS) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`hardware-server USB data copy stalled at ${copied}/${copyProgress.total} after ${elapsed}s — aborting`)
      finish({ status: "stalled", copied, total: copyProgress.total })
      abortByUnmount('stall')
    }
  }, COPY_PROGRESS_SAMPLE_MS)

  const totalDeadline = setTimeout(() => {
    if (mySession !== copySession) return
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`hardware-server USB data copy exceeded ${COPY_TOTAL_DEADLINE_MS / 1000}s deadline after ${elapsed}s — aborting`)
    finish({ status: "timeout" })
    abortByUnmount('timeout')
  }, COPY_TOTAL_DEADLINE_MS)

  usb.copyTo("/data", /.*$/, (err) => {
    if (mySession !== copySession) {
      // a watchdog already aborted this session; ignore the late callback
      console.log('hardware-server USB data copy late callback (watchdog already aborted) — ignoring')
      return
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    if (err) {
      console.log(`hardware-server USB data copy failed after ${elapsed}s`, err)
      finish(fail)
    } else {
      console.log(`hardware-server USB data copy completed successfully in ${elapsed}s`)
      finish(success)
    }
  })
})

/**
 * load WiFi credentials from USB mount point
 * overwrite wpa_supplicant file
 */
router.get('/wifi', function (req, res, next) {
  const path = "/mnt/usb/wifi/credentials.json"
  let response = fail

  if (fs.existsSync(path)) {
    try {
      // load JSON file with credentials
      var data = JSON.parse(fs.readFileSync(path, 'utf8'))
      if (data.hasOwnProperty("psk")) {
        command(`sudo nmcli dev wifi connect "${data.ssid}" password "${data.psk}"`)
        command(`sudo nmcli c mod "${data.ssid}" ipv4.method auto`)
      } else {
        command(`sudo nmcli dev wifi connect "${data.ssid}"`)
        command(`sudo nmcli c mod "${data.ssid}" ipv4.method auto`)
      }
      // command('sudo rm /etc/wpa_supplicant/.wpa_supplicant.conf.swp') // remove bad lock file

      response = success
    } catch (err) {
      console.log('something went wrong adding wifi network')
      console.log(err)
    }
  } else {
    console.log('hardware-server WiFi crendentials path does not exist', path)
    console.log('obtaining WiFi credentials from raspberry pi')

  }
  res.json(response)
  console.log('usb response', response, 'connecting to internet')
})

export default router
import express from 'express'
import fs from 'fs'
import { UsbStorage } from '../../usb-storage-driver/index.js'
import drivelist from 'drivelist'
import command from '../../command.js'

const router = express.Router()

const usb = new UsbStorage()
let mountInProgress = false
let copyInProgress = false
let copyProgress = { total: 0, baselineFiles: 0 }

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
 */
router.get('/data', (req, res, next) => {
  if (copyInProgress) {
    console.log('hardware-server USB data copy already in progress, ignoring duplicate request')
    res.json({ status: "busy" })
    return
  }
  copyInProgress = true
  copyProgress.total = countFiles("/data")
  copyProgress.baselineFiles = countFiles("/mnt/usb")
  req.setTimeout(1000 * 60 * 10) // set a 10 minute timeout for the usb transfer process to complete
  const startTime = Date.now()
  console.log(`hardware-server USB data copy started from /data to USB (${copyProgress.total} files)`)
  usb.copyTo("/data", /.*$/, (err) => {
    copyInProgress = false
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    if (err) {
      console.log(`hardware-server USB data copy failed after ${elapsed}s`, err)
      res.json(fail)
    } else {
      console.log(`hardware-server USB data copy completed successfully in ${elapsed}s`)
      res.json(success)
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
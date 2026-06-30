import express from 'express'
import fs from 'fs'
import { UsbStorage } from '../../usb-storage-driver/index.js'
import drivelist from 'drivelist'
import command from '../../command.js'

const router = express.Router()

const usb = new UsbStorage()

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
  usb.mount()
    .then(() => {
      res.json(success)
    }).catch((err) => {
      console.log('hardware-server USB mount error')
      console.error(err)
      res.json(fail)
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
 * copy data files from station to USB 
 */
router.get('/data', (req, res, next) => {
  req.setTimeout(1000 * 60 * 10) // set a 10 minute timeout for the usb transfer process to complete
  usb.copyTo("/data", /.*$/, (err) => {
    if (err) {
      res.json(fail)
    } else {
      res.json(success)
    }
  })
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
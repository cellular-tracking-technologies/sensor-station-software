import { glob } from 'glob'
import express from 'express'
import Wifi from '../../hardware/pi/network/wifi.js'
import NetworkConnection from '../../hardware/pi/network/connection.js'
import RunCommand from '../../command.js'

const router = express.Router();

/**
 * get default route to the internet
 */
router.get('/gateway', (req, res) => {
  res.json(NetworkConnection.Gateway())
})

router.get('/status', async (req, res) => {
  const { ping_count } = req.query
  try {
    const { success, fail } = await NetworkConnection.Ping({ ping_count })
    res.json({ success, fail })
  } catch (err) {
    console.error('error pinging server')
    console.error(err)
    res.json({
      success: 0,
      fail: ping_count,
    })
  }
})

router.get('/enable-wifi', async (req, res) => {
  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/enable-wifi.sh')

  return res.status(200).send()
})

router.get('/disable-wifi', async (req, res) => {
  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/disable-wifi.sh')
  return res.status(200).send()
})

// router.get('/p2p', async (req, res) => {
//   await RunCommand('nmcli device status | grep ")
// })

router.get('/enable-p2p', async (req, res) => {
  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/enable-p2p.sh')
  await RunCommand('sudo systemctl restart NetworkManager')
  return res.status(200).send()
})

router.get('/disable-p2p', async (req, res) => {
  // await RunCommand('sudo nmcli con delete p2p')
  await RunCommand('sudo rm /etc/NetworkManager/system-connections/p2p*')
  await RunCommand('sudo systemctl restart NetworkManager')
  return res.status(200).send()
})

const getStatsForDir = async (opts) => {
  const { dir } = opts
  const files = await glob(dir, { stat: true, withFileTypes: true })
  const bytes = files.reduce((total, file) => total += file.size, 0)
  return {
    bytes: bytes,
    file_count: files.length
  }
}

const getPendingUploads = async () => {
  const [ctt, sg] = await Promise.all([
    getStatsForDir({ dir: '/data/rotated/*.gz' }),
    getStatsForDir({ dir: '/data/SGdata/*/*.gz' }),
  ])
  return {
    ctt,
    sg,
  }
}

router.get('/pending-upload', async (req, res, next) => {
  try {
    const pending_uploads = await getPendingUploads()
    res.json(pending_uploads)
  } catch (err) {
    console.error('error getting pending uploads')
    console.error(err)
    res.json({
      bytes: -1,
      file_count: -1
    })
  }
})

router.get('/wifi-networks', (req, res, next) => {
  const wifi = Wifi.GetCurrentNetwork()
  if (wifi) {
    res.json(wifi)
  } else {
    res.json({
      signal: undefined,
      state: false,
    })
  }

})

export default router
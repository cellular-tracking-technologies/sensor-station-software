
import express from 'express'
import { exec } from 'child_process'
import ModemCache from '../../hardware/pi/network/modem-cache.js'
import ConnectivityProbe from '../../hardware/pi/network/connectivity-probe.js'
import RunCommand from '../../command.js'

const router = express.Router()

/* GET home page. */
router.get('/', async function (req, res, next) {
  try {
    const info = await ModemCache.get()
    res.json(info)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/ppp', async (req, res, next) => {
  // Real connectivity probe via ConnectivityProbe — an actual ping to
  // 1.1.1.1 bound to the modem interface, run in the background every 10s.
  // Returns { ppp: boolean, interface, ageMs } where ppp is true only if
  // a probe succeeded within the freshness window.
  //
  // This replaces the old "ifconfig | grep modem-iface" check, which gave
  // false positives whenever an unprovisioned modem brought up mdm0
  // without the modem-side NAT actually forwarding traffic.
  try {
    const status = await ConnectivityProbe.get()
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/signal-strength', async (req, res) => {
  try {
    const info = await ModemCache.get()
    res.json(info)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/enable-modem', async (req, res) => {

  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/enable-modem.sh')
  // await RunCommand('nmcli connection up station-modem')

  return res.status(200).send()
})
router.get('/disable-modem', async (req, res) => {
  // await RunCommand('nmcli connection down station-modem')

  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/disable-modem.sh')
  return res.status(200).send()
})

export default router
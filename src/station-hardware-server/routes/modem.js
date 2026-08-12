
import express from 'express'
import { exec } from 'child_process'
import ModemCache from '../../hardware/pi/network/modem-cache.js'
import ConnectivityProbe from '../../hardware/pi/network/connectivity-probe.js'
import CellUsage from '../../hardware/pi/network/cell-usage.js'
import RunCommand from '../../command.js'

const router = express.Router()

/* GET home page. */
router.get('/', async function (req, res, next) {
  try {
    // Modem state (mmcli) plus cumulative cellular data usage (sysfs byte
    // counters, accumulated across interface resets). Usage rides along here
    // rather than on its own endpoint so it reaches the cloud automatically:
    // server-api.js posts this route's body as `modem` in the 6-hourly health
    // check-in, so no new client or server plumbing is needed.
    //
    // Usage is best-effort — a failure to account bytes must never turn the
    // modem-status endpoint into a 500, so it degrades to null.
    const info = await ModemCache.get()
    let usage = null
    try {
      usage = await CellUsage.get()
    } catch (err) {
      console.error('cell usage unavailable', err.message)
    }
    res.json({ ...info, usage })
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
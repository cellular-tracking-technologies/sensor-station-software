
import express from 'express'
import { exec } from 'child_process'
import ModemCache from '../../hardware/pi/network/modem-cache.js'
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

router.get('/ppp', (req, res, next) => {
  // check if at least 1 cellular data interface is up:
  //   wwan* — Quectel QMI
  //   ppp*  — Telit PPP (legacy data path)
  //   mdm*  — Telit RNDIS (mdm0 — current data path)
  exec('ifconfig | grep -E "^(wwan|ppp|mdm)" | wc -l', (err, stdout, stderr) => {
    if (err) {
      res.status(500).send(err.toString())
    }
    let status = false
    if (parseInt(stdout) > 0) {
      status = true
    }
    res.json({
      ppp: status
    })
  })
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
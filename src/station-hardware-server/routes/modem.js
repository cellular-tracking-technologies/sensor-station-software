
import express from 'express'
import { exec } from 'child_process'
import RunCommand from '../../command.js'
var router = express.Router()

const ModemInfo = {
  signal: null,
  imsi: null,
  imei: null,
  sim: null,
  info: null,
  creg: null,
  carrier: null,
  access_tech: null,
}

/* GET home page. */
router.get('/', async function (req, res, next) {
  const modem_info = JSON.parse(await RunCommand('sudo mmcli -J -m 0'))
  const sim_info = JSON.parse(await RunCommand('sudo mmcli -J -m 0 -i 0'))
  const modem = modem_info.modem
  const broadband = modem['3gpp']
  const generic_info = modem.generic
  const signal = generic_info['signal-quality']
  ModemInfo.signal = signal.value
  ModemInfo.imsi = sim_info.sim.properties.imsi
  ModemInfo.imei = broadband.imei
  ModemInfo.sim = sim_info.sim.properties.iccid
  ModemInfo.info = generic_info.model + ' - ' + generic_info.revision
  ModemInfo.creg = broadband['registration-state']
  ModemInfo.carrier = broadband['operator-name']
  ModemInfo.access_tech = generic_info['access-technologies']
  ModemInfo.tower = broadband['operator-code']
  res.json(ModemInfo)
})

router.get('/ppp', (req, res, next) => {
  // check general state of station modem using network manager
  exec('nmcli -f GENERAL.STATE connection show station-modem | grep activated | wc -l', (err, stdout, stderr) => {
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

router.post('/stop', (req, res, next) => {
  RunCommand('nmcli connection down station-modem')
    .then((response) => {
      res.status(204).send()
    })
    .catch((err) => {
      res.status(500).send(err.toString())
    })
})

router.post('/start', (req, res, next) => {
  RunCommand('nmcli connection up station-modem')
    .then((response) => {
      res.status(204).send()
    })
    .catch((err) => {
      res.status(500).send(err.toString())
    })
})

router.post('/enable', async (req, res, next) => {
  // delete station-modem connection before adding
  await RunCommand('nmcli connection delete station-modem')
  // add new station-modem connection
  await RunCommand('nmcli connection add type gsm ifname '*' con-name station-modem apn super connection.autoconnect yes')
  res.status(204).send()
})

router.post('/disable', async (req, res, next) => {
  await RunCommand('nmcli connection delete station-modem')
  res.status(204).send()
})

export default router
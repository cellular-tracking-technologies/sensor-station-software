
import express from 'express'
import { exec } from 'child_process'
import ModemUtil from '../../hardware/pi/network/modem.js'
import RunCommand from '../../command.js'

const router = express.Router()

/* GET home page. */
router.get('/', function (req, res, next) {
  res.json(ModemUtil.info())
})

router.get('/ppp', (req, res, next) => {
  // check if at least 1 ppp connection exists
  exec('ifconfig | grep wwan | wc -l', (err, stdout, stderr) => {
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

router.get('/signal-strength', (req, res) => {

  res.json(ModemUtil.info())
  // res.json({
  //   signal: ModemUtil.signal,
  //   state: ModemUtil.state,
  // })
})

router.get('/enable-modem', async (req, res) => {
  await RunCommand('nmcli connection up station-modem')
  return res.status(200).send()
})
router.get('/disable-modem', async (req, res) => {
  await RunCommand('nmcli connection down station-modem')
  return res.status(200).send()
})

export default router
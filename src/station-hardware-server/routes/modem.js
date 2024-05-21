
import express from 'express'
import { exec } from 'child_process'
import { ModemInterface, QuectelCommandSetParser } from '../../modem-status-driver/index.js'
import RunCommand from '../../command.js'
var router = express.Router()

const Modem = new ModemInterface({
  uri: '/dev/station_modem_status',
  baud_rate: 115200,
  command_set_parser: QuectelCommandSetParser,
  poll_frequency_seconds: 10
})

try {
  Modem.open()
} catch (err) {
  console.error('unable to open the modem')
  console.error(err)
}
console.log('modem info', Modem.info)

/* GET home page. */
router.get('/', function (req, res, next) {
  res.json(Modem.info)
})

router.get('/ppp', (req, res, next) => {
  // check if at least 1 ppp connection exists
  exec('ifconfig | grep ppp | wc -l', (err, stdout, stderr) => {
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
  try {
    let rssi
    console.log('modem info', Modem.info)
    if (Modem.info.signal) {

      let { signal } = Modem.info
      rssi = signal.match(/(-)\w+/g) ? Number(signal.match(/(-)\w+/g)) : undefined
    } else {
      rssi = undefined
    }
    res.json({ signal: rssi })
  } catch (e) {
    console.error('lcd cell error', e)

  }
})

export default router
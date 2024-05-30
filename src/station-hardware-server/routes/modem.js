
import express from 'express'
import { exec } from 'child_process'
var router = express.Router()

const Modem = {
  info: {},
}

/* GET home page. */
router.get('/', function (req, res, next) {
  res.json(Modem.info)
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
  res.json({ signal: undefined })
})

export default router
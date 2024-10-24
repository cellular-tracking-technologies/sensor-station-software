import express from 'express'
import Cron from '../../hardware/pi/cron.js'
const router = express.Router()

router.get('/reboot-schedule', (req, res) => {
  res.json(Cron.GetRebootSchedule())
})

router.post('/update-reboot-schedule', (req, res) => {
  const {
    minute,
    hour,
    dom,
    mon,
    dow
  } = req.body
  Cron.UpdateRebootSchedule({
    minute,
    hour,
    dom,
    mon,
    dow
  })
})

export default router
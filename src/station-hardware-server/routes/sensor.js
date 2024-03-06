import express from 'express'
import SensorMonitor from '../../hardware/sensors/index.js'
const router = express.Router()

let sensor_data = {
  voltages: {},
  temperature: {}
}

try {
  let Monitor = new SensorMonitor()
  Monitor.start(5000)
  Monitor.on('sensor', (data) => {
    sensor_data.voltages = data.voltages
    sensor_data.temperature = data.temperature
  })
  Monitor.read()
} catch (err) {
  console.error(err)
}

router.get('/voltages', function (req, res, next) {
  res.json(sensor_data.voltages)
})

router.get('/temperature', function (req, res, next) {
  res.json(sensor_data.temperature)
})

router.get('/details', (req, res, next) => {
  res.json({
    voltages: sensor_data.voltages,
    temperature: sensor_data.temperature
  })
})

export default router

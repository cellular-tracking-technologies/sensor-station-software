import express from 'express'
import fs from 'fs'

const router = express.Router()

// The analog sensors (ADC rail voltages + board temperature) are now read by the
// native ctt-sensors daemon, which publishes a snapshot to /run/ctt/sensors.json
// every few seconds. This route is a thin reader of that file — the hardware-
// server no longer touches I2C itself. The daemon writes atomically (temp file +
// rename), so a reader never sees a half-written file.
const SENSORS_FILE = '/run/ctt/sensors.json'

function readSensors() {
  try {
    const data = JSON.parse(fs.readFileSync(SENSORS_FILE, 'utf8'))
    return {
      voltages: data.voltages || {},
      temperature: data.temperature || {},
    }
  } catch (err) {
    // File missing (daemon not up yet) or unreadable — return empties, matching
    // the old behaviour before the first SensorMonitor reading arrived.
    return { voltages: {}, temperature: {} }
  }
}

// GET /sensor — mirror the current snapshot (voltages + temperature). This is the
// documented entry point (SEN-01); /details, /voltages, /temperature remain for
// callers that want a subset.
router.get('/', (req, res) => {
  res.json(readSensors())
})

router.get('/voltages', (req, res) => {
  res.json(readSensors().voltages)
})

router.get('/temperature', (req, res) => {
  res.json(readSensors().temperature)
})

router.get('/details', (req, res) => {
  res.json(readSensors())
})

export default router

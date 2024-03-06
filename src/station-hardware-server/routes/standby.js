import express from 'express'
import WifiSignal from '../../hardware/wifi/wifi-signal.js'

// import SensorMonitor from '../../hardware/sensors/index.js'
// import modemRouter from '../routes/modem.js'

const router = express.Router()
router.get('/standby', async (req, res, next) => {
    let wifi = new WifiSignal()
    let percent = await wifi.getWifiSignal()
    res.json({ wifi_strength: percent, })
})


export default router





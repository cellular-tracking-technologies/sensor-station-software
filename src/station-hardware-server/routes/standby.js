import express from 'express'
import { exec } from 'child_process'

import WifiSignal from '../../hardware/wifi/wifi-signal.js'
import SensorMonitor from '../../hardware/sensors/index.js'
import modemRouter from '../routes/modem.js'

const router = express.Router()
router.get('/standby', (req, res, next) => {
    res.json({
        wifi_strength: '90%',
        // temperature: standby_data.temperature,
        // voltages: standby_data.voltages,
    })

})


export default router
// let standby_data = {
//     voltages: {},
//     temperature: {},
//     wifi_percent: {},
// }

// try {
//     let Monitor = new SensorMonitor()
//     Monitor.start(5000)
//     Monitor.on('sensor', (data) => {
//         standby_data.voltages = data.voltages
//         standby_data.temperature = data.temperature
//     })
//     Monitor.read()
// } catch (err) {
//     console.error(err)
// }

// try {
//     let wifi = new WifiSignal
//     standby_data.wifi_percent = await wifi.getWifiSignal()
//     // console.log('standby route wifi', standby_data.wifi_percent)
// } catch (err) {
//     console.error(err)
// }






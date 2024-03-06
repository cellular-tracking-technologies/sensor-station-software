import express from 'express'
import fs from 'fs'
import StationId from '../../hardware/id-driver/index.js'
import path from 'path'
import { ComputeModule } from './compute-module.js'
import { fileURLToPath } from 'url'
import StationIdInterface from '../../hardware/id-driver/station-id-interface.js'
import WifiSignal from '../../hardware/wifi/wifi-signal.js'


// import { exec } from 'child_process'

// import SensorMonitor from '../../hardware/sensors/index.js'



const ModuleInfo = new ComputeModule()

// try {
// 	let Monitor = new SensorMonitor()
// 	Monitor.start(5000)
// 	Monitor.on('sensor', (data) => {
// 		standby_data.voltages = data.voltages
// 		standby_data.temperature = data.temperature
// 	})
// 	Monitor.read()
// } catch (err) {
// 	console.error(err)
// }



const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const read_package_version = () => {
	let contents = fs.readFileSync(path.resolve(__dirname, '../../../package.json'))
	return JSON.parse(contents)
}

const package_info = read_package_version()

const DEVICE_ID = StationId.FromFile()

/* GET home page. */
router.get('/', function (req, res, next) {
	res.json({ welcome: true })
})

router.get('/id', function (req, res, next) {
	res.json({ id: DEVICE_ID })
})

/**
 * endpoint to determine station hardware revision
 */
router.get('/revision', async (req, res) => {
	const id_interface = new StationIdInterface()
	const hardware_info = await id_interface.getVersion()
	res.json(hardware_info)
})

const get_about_info = () => {
	let bootcount
	try {
		bootcount = parseInt(fs.readFileSync('/etc/bootcount').toString().trim())
	} catch (err) {
		// error reading bootcount
		bootcount = 0
	}
	let station_image
	try {
		station_image = fs.readFileSync('/etc/ctt/station-image').toString().trim()
	} catch (err) {
		// cannot read station image...
	}
	let station_software
	try {
		station_software = fs.readFileSync('/etc/ctt/station-software').toString().trim()
	} catch (err) {
		// cannot read station software last update time
	}
	return {
		bootcount: bootcount,
		station_image: station_image,
		station_software: station_software
	}
}

router.get('/about', (req, res, next) => {
	ModuleInfo.info()
		.then((info) => {
			info.station_id = DEVICE_ID
			return info
		})
		.then((info) => {
			let about_info = get_about_info()
			info.bootcount = about_info.bootcount
			info.station_image = about_info.station_image
			info.station_software = about_info.station_software
			res.json(info)
		})
		.catch((err) => {
			res.json({ err: err.toString() })
		})
})

router.get('/node/version', function (req, res, next) {
	res.json({ version: package_info.version })
})

router.get('/standby', async (req, res, next) => {
	let wifi = new WifiSignal()
	let percent = await wifi.getWifiSignal()
	res.json({ wifi_strength: percent, })
	// res.json({
	// 	wifi: standby_data.wifi_percent,
	// 	temperature: standby_data.temperature,
	// 	voltages: standby_data.voltages,
	// })

})







export default router
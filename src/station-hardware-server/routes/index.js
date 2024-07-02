import express from 'express'
import fs from 'fs'
import path from 'path'
import { ComputeModule } from './compute-module.js'
import { fileURLToPath } from 'url'
import StationInformation from '../../system.js'

const ModuleInfo = new ComputeModule()

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const read_package_version = () => {
	let contents = fs.readFileSync(path.resolve(__dirname, '../../../package.json'))
	return JSON.parse(contents)
}

const package_info = read_package_version()

/* GET home page. */
router.get('/', function (req, res, next) {
	res.json({ welcome: true })
})

router.get('/id', function (req, res, next) {
	res.json({ id: StationInformation.Hardware.Id })
})

/**
 * endpoint to determine station hardware revision
 */
router.get('/revision', async (req, res) => {
	res.json({
		revision: StationInformation.Hardware.Revision,
		version: StationInformation.Hardware.Version,
	})
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
	// let station_id
	// try {
	// 	station_id = fs.readFileSync('/etc/ctt/station-id').toString().trim()
	// } catch (err) {
	// 	// cannot read station software last update time
	// }
	return {
		bootcount: bootcount,
		station_image: station_image,
		station_software: station_software
	}
}

router.get('/about', async (req, res, next) => {
	await ModuleInfo.info()
		// .then((info) => {
		// 	// info.station_id = DEVICE_ID
		// 	return info
		// })
		.then((info) => {
			let about_info = get_about_info()
			info.bootcount = about_info.bootcount
			info.station_image = about_info.station_image
			// info.station_software = about_info.station_software
			info.station_software = StationInformation.Software
			info.station_id = StationInformation.Id
			res.json(info)
		})
		.catch((err) => {
			res.json({ err: err.toString() })
		})
})

router.get('/node/version', function (req, res, next) {
	res.json({ version: package_info.version })
})


export default router
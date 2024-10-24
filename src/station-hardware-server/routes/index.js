import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import System from '../../system.js'
import Os from '../../hardware/pi/os.js'

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
	res.json({ id: System.Hardware.Id })
})

/**
 * endpoint to determine station hardware revision
 */
router.get('/revision', async (req, res) => {
	res.json({
		revision: System.Hardware.Revision,
		version: System.Hardware.Version,
	})
})

router.get('/about', async (req, res, next) => {
	const os_info = Os()
	res.json({
		station_id: System.Hardware.Id,
		bootcount: System.BootCount,
		station_image: System.Image,
		station_software: os_info.software_update,
		hardware: System.Module.Hardware,
		serial: System.Module.Serial,
		revision: System.Module.Revision,
		loadavg_15min: os_info.loadavg_15min,
		free_mem: os_info.free_mem,
		total_mem: os_info.total_mem,
		uptime: os_info.uptime,
		disk_usage: os_info.disk_usage,
	})
})

router.get('/node/version', function (req, res, next) {
	res.json({ version: package_info.version })
})


export default router
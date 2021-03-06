import express from 'express'
import fs from 'fs'
import getDeviceId from '../../id-driver/index.js'
import path from 'path'
import { ComputeModule } from './compute-module.js'
import { fileURLToPath } from 'url'

const ModuleInfo = new ComputeModule()

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const read_package_version = () => {
  let contents = fs.readFileSync(path.resolve(__dirname, '../../../package.json'))
  return JSON.parse(contents)
}

const package_info = read_package_version()

let device_id
getDeviceId().then((id) => {
  device_id = id
}).catch((err) => {
  console.log('Device ID Error')
  console.error(err)
  device_id = "error"
})

/* GET home page. */
router.get('/', function (req, res, next) {
  res.json({ welcome: true })
})

router.get('/id', function (req, res, next) {
  res.json({ id: device_id })
})

const get_about_info = () => {
	let bootcount 
	try {
		bootcount = parseInt(fs.readFileSync('/etc/bootcount').toString().trim())
	} catch(err) {
		// error reading bootcount
		bootcount = 0
	}
	let station_image
	try {
		station_image = fs.readFileSync('/etc/ctt/station-image').toString().trim()
	} catch(err) {
		// cannot read station image...
	}
	let station_software
	try {
		station_software = fs.readFileSync('/etc/ctt/station-software').toString().trim()
	} catch(err) {
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
      info.station_id = device_id
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
	res.json({ version: package_info.version})
})

export default router
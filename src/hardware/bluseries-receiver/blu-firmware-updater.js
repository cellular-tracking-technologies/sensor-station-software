import fs from 'fs'
// import bin from './driver/bin/blu_adapter_v1.0.0+.bin'
import path from 'path'

// import BluReceiver from '../blu-receiver'

class BluFirmwareUpdater {

	constructor() {
		this.file_list = []

		// this.current_firmware = bin
		// this.new_firmware = './lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/blu_adapter_v1.0.1+0 .bin'
	}

	async checkIfFileExists(filepath) {
		return new Promise((resolve) => {
			fs.stat(filepath, (err, stats) => {
				if (err) {
					resolve(false)
				} else {
					resolve(true)
				}
			})
		})
	}

	readFirmwareFiles() {
		this.file_list = fs.readdirSync('/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin')
		console.log('firmware file list', this.file_list)
		return this.file_list
		// fs.readdir('/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin', (err, files) => {
		// 	if (err) {
		// 		return console.log('unable to scan directory: ' + err)
		// 	} else {
		// 		files.forEach((file) => {
		// 			console.log('bin files', file)
		// 			this.file_list.push(file)
		// 		})
		// 		console.log('file list', this.file_list)
		// 		return this.file_list
		// 	}
		// })

	}

	async getMostRecentFirmware(file_list) {
		try {
			console.log('firmware file list', file_list)
			for (let i = 0; i < file_list.length; i++) {
				for (let j = 1; j < file_list.length; j++) {
					if (file_list[j] > file_list[i]) {
						console.log('file list i', file_list[i], 'file list j', file_list[j])
						console.log('most recent firmware second in array', file_list[j])
						return file_list[j]
					} else if (file_list[i] > file_list[j]) {
						console.log('most recent firmware 1st in array', file_list[i])
						return file_list[i]
					} else {
						console.log('most recent file is oldest file', file_list[i])
						return file_list[i]
					}
				}
			}
		} catch (e) {
			console.error(e)
		}
	}
}

export default BluFirmwareUpdater

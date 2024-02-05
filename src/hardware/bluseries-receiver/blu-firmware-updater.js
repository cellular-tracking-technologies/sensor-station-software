import fs from 'fs'

class BluFirmwareUpdater {

	constructor() {
		this.file_list = []
		this.previous_firmware
		this.current_firmware
		this.new_firmware
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
	}

	// async getCurrentFirmware(version) {
	async getCurrentFirmware() {
		try {
			let file_list = this.readFirmwareFiles()
			// console.log('firmware file list', file_list)
			// this.current_firmware = file_list.find(file => file.substring(13, 20) == version)
			// console.log('get current firmware version', version, 'first file', file_list[0].substring(13, 20))
			// console.log('current firmware', this.current_firmware)
			// return '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/' + this.current_firmware

			for (let i = 0; i < file_list.length; i++) {
				for (let j = 1; j < file_list.length; j++) {
					if (file_list[j] < file_list[i]) {
						console.log('file list i', file_list[i], 'file list j', file_list[j])
						console.log('current firmware second in array', file_list[j])
						this.current_firmware = file_list[j]
					} else if (file_list[i] < file_list[j]) {
						console.log('current firmware 1st in array', file_list[i])
						this.current_firmware = file_list[i]
					} else {
						console.log('most recent file is current firmware file', file_list[i])
						this.current_firmware = file_list[i]
					}
				}
				return '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/' + this.current_firmware

			}
		} catch (e) {
			console.error(e)
		}
	}

	async getNewFirmware() {
		let file_list = this.readFirmwareFiles()

		try {
			console.log('firmware file list', file_list)
			for (let i = 0; i < file_list.length; i++) {
				for (let j = 1; j < file_list.length; j++) {
					if (file_list[j] > file_list[i]) {
						console.log('file list i', file_list[i], 'file list j', file_list[j])
						console.log('most recent firmware second in array', file_list[j])
						this.new_firmware = file_list[j]
						// return this.new_firmware
					} else if (file_list[i] > file_list[j]) {
						console.log('most recent firmware 1st in array', file_list[i])
						this.new_firmware = file_list[i]
						// return this.new_firmware
					} else {
						console.log('most recent file is oldest file', file_list[i])
						this.new_firmware = file_list[j]
						// return this.new_firmware
					}
				}

				console.log('current firmware', this.current_firmware, 'new firmware', this.new_firmware)
				return '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/' + this.new_firmware

			}
		} catch (e) {
			console.error(e)
		}
	}

	revertFirmwareUpdate(version) {
		console.log('incoming firmware file', version)
		this.readFirmwareFiles()
		this.previous_firmware = this.file_list.find(e => e.substring(14, 19) < version)
		console.log('revert firmware previous firmware', this.previous_firmware)
		return '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/' + this.previous_firmware
	}

	async updateFirmwareFiles() {
		this.previous_firmware = this.current_firmware
		this.current_firmware = this.new_firmware
	}

	async checkFirmware(version) {
		console.log('check firmware version', version)
		this.readFirmwareFiles()
		console.log('first fw file substring', this.file_list[0].substring(13, 20))

		this.previous_firmware = this.file_list.find(e => e.substring(13, 20) < version)
		console.log('previous firmware', this.previous_firmware)

		this.current_firmware = this.file_list.find(e => e.substring(13, 20) == version)
		console.log('current firmware', this.current_firmware)

		this.new_firmware = this.file_list.find(e => e.substring(13, 20) > version)
		console.log('new firmware', this.new_firmware)

	}
}

export default BluFirmwareUpdater

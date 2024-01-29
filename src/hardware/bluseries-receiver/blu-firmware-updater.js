import fs from 'fs'
// import bin from './driver/bin/blu_adapter_v1.0.0+.bin'
import path from 'path'

// import BluReceiver from '../blu-receiver'

class BluFirmwareUpdater {

    constructor() {

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

    async readFirmwareFiles() {
        let firmware_file
        let dir_name = path.join(__dirname, '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin')
        console.log('dir name', dir_name)
        let file_list = fs.readdir(dir_name, (err, files) => {
            if (err) {
                return console.log('unable to scan directory: ' + err)
            } else {
                files.forEach((file) => {
                    console.log('bin files', file)
                })
            }
        })
        console.log('file list', file_list)
        return file_list

        // if (file_list[1]) {
        //     firmware_file = file_list[1]
        // } else {
        //     firmware_file = file_list[0]
        // }
        // let file_exists = await this.checkIfFileExists(this.new_firmware)
        // if (file_exists != true) {
        //     firmware_file = this.current_firmware
        //     //     // let firmware_object = {
        //     //     //     msg_type: 'blu-firmware',

        //     //     // }
        // } else {

        //     // firmware_file = fs.readFileSync(this.new_firmware).toString()
        //     return firmware_file
        //     // }
        // }
    }
}

export default BluFirmwareUpdater

import fs from 'fs'

const FirmwareDirectory = 'src/hardware/ctt/bluseries-receiver/driver/bin/'

class BluFirmwareUpdater {

  constructor() {
    this.file_list = []
    // this.previous_firmware
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
    this.file_list = fs.readdirSync(FirmwareDirectory)
    return this.file_list
  }

  async getNewFirmware() {
    let file_list = this.readFirmwareFiles()

    try {
      let arranged_list = file_list.reverse()
      console.log('firmware arranged file list', arranged_list)

      this.new_firmware = FirmwareDirectory + arranged_list[0]
      this.current_firmware = FirmwareDirectory + arranged_list[1]
      console.log('new firmware file', this.new_firmware)
      console.log('current firmware file', this.current_firmware)


    } catch (e) {
      console.error(e)
    }
  }
}

let blu_updater = new BluFirmwareUpdater()
blu_updater.getNewFirmware()

export default BluFirmwareUpdater

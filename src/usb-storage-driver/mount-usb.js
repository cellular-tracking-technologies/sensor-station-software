import { exec } from 'child_process'
import fs from 'fs'
import Command from '../command.js'

class MountUsb {

  constructor(dir) {
    this.dir = dir
  }

  async mount(device) {
    // check if the mount directory exists
    if (fs.existsSync(this.dir) == false) {
      // make the mount directory
      fs.mkdirSync(this.dir)
    }

    return Command(`mount ${device} ${this.dir}`)
  }

  async unmount() {
    console.log('mount-usb unmounting USB drive', this.dir)
    if (fs.existsSync(this.dir) == false) {
      // the path does not exist - 
      return
    }
    return Command(`umount ${this.dir}`)
  }

  async clean() {
    console.log('mount-usb cleaning up mount dir', this.dir)
    if (fs.existsSync(this.dir) == false) {
      console.log('mount-usb mount directory does not exist - ignorning')
      resolve()
    }
    return Command(`rm -rf ${this.dir}`)
  }
}

export default MountUsb

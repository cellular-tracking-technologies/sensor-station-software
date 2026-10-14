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
    try {
      return await Command(`umount ${this.dir}`)
    } catch (err) {
      if (err.message && err.message.includes('target is busy')) {
        console.log('mount-usb target is busy, attempting lazy unmount', this.dir)
        return Command(`umount -l ${this.dir}`)
      }
      throw err
    }
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

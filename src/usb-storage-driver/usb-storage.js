import MountUsb from './mount-usb.js'
import ncp from 'ncp'
import path from 'path'
import UsbScanner from './usb-scanner.js'

class UsbStorage {
  
  constructor(mount_point = "/mnt/usb") {
    this.mount_point = mount_point
    this.drive = new MountUsb(mount_point)
    this.scanner = new UsbScanner()
  }

  /**
   * mount an attached USB drive (1st usb drive found)
   */
  async mount() {
    // first run the unmount script to clean the mount directory (rm)
    try {
      await this.unmount()
    } catch(err) {
      console.log('usb-storage unable to unmount', this.mount_point, 'prior to mount phase')
    }
      // get a USB drive
    const usb_device = await this.scanner.retriveUsb()
    // validate usb drive has been detected
    if (usb_device) {
      // return first drive in the list...
      
      await this.drive.mount(usb_device.path)
    } else {
      reject("No Usb Devices Detected")
    }
  }

  /**
   * unmount USB drive
   */
  async unmount() {
    // unmount the drive
    await this.drive.unmount()
    // clean (remove the mount directory)
    await this.drive.clean()
  }

  /**
   * copy files to the USB drive
   * @param {*} src 
   * @param {*} pattern 
   * @param {*} callback 
   */
  copyTo(src, pattern, callback) {
    ncp.ncp.limit = 16
    ncp(src, this.mount_point, { 
      filter: pattern,
      dereference: true
    }, callback)
  }

  /**
   * copy files from the USB drive
   * @param {*} src 
   * @param {*} dest 
   * @param {*} callback 
   */
  copyFrom(src, dest, callback) {
    ncp.ncp.limit = 16
    ncp(path.join(this.mount_point, src), dest, callback)
  }
}

export default UsbStorage

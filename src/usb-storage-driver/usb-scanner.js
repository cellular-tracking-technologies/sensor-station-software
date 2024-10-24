import { exec } from 'child_process'

class UsbScanner {
  async scan() {
    return new Promise((resolve, reject) => {
      exec('lsblk -O --json', (error, stdout, stderr) => {
        if (error) {
          console.log('UsbScanner error')
          console.error(error)
          reject(error)
        }
        const results = JSON.parse(stdout)
        // filter out USB devices by the 'tran' key returned by lsblk
        resolve(results.blockdevices.filter(device => device.tran=='usb'))
      })
    })
  }

  /**
   * use lsblk comman to scan for USB drives - return first partition / block device detected
   * @returns 
   */
  async retriveUsb() {
    console.log('searching for USB drives')
    const usb_devices = await this.scan()
    if (usb_devices.length > 0) {
      // use the first USB drive detected
      console.log(`detected ${usb_devices.length} USB devices`)
      const usb_device = usb_devices[0]
      console.log(`using device  at ${usb_device.path}; size: ${usb_device.size}; model: ${usb_device.model}`)
      // check for child partitions 
      if (usb_device.children) {
        // children key exists - should have partitions
        if (usb_device.children.length > 0) {
          // return the first partition of the USB device
          const device = usb_device.children[0]
          console.log(`identified child partition; file type: ${device.fstype}`)
          return device
        }
      } else {
        // return the block device 
        console.log(`no partitions identified - using block device; file type: ${usb_device.fstype}`)
        return usb_device
      }
    }
  }
}

export default UsbScanner
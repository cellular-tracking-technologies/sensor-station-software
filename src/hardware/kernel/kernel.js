import { execSync } from 'child_process'
import { bookworm, bullseye } from './gpio-pins.js'


// https://nodejs.org/docs/latest-v12.x/api/child_process.html#child_process_child_process_exec_command_options_callback

export default class KernelInfo {
  static cmd = 'uname -a'
  static bullseye = '6.1'
  static bookworm = '6.6'

  static getVersion() {
    const kernel = execSync('uname -a').toString().match(/(?<version>\d+.\d+.\d+)/).groups.version
    return kernel
  }


  static compareVersions() {

    const current_version = KernelInfo.getVersion()
    console.log('kernel version', current_version)

    let cur_components = current_version.split('.')
    console.log('current kernel componenets', cur_components)
    // let bookworm_components = this.bookworm.split('.')
    let bullseye_components = this.bullseye.split('.')
    console.log('bullseye kernel componenets', bullseye_components)


    let len = Math.min(cur_components.length, bullseye_components.length)

    for (let i = 0; i <= len; i++) {
      // if current version is larger than bullseye version
      if (parseInt(cur_components[i]) > parseInt(bullseye_components)) {
        return 1
      }

      if (parseInt(cur_components[i]) < parseInt(bullseye_components)) {
        return -1
      }
    }
  }

  static getPins() {
    const kernel = KernelInfo.compareVersions()
    let pins
    let image = kernel > 0 ? 'bookworm' : 'bullseye'
    // return image
    if (image === 'bookworm') {
      pins = bookworm
    } else if (image === 'bullseye') {
      pins = bullseye
    }
    return pins
  }
}

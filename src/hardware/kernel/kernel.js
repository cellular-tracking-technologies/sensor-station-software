import { execSync } from 'child_process'

class KernelVersion {
  constructor() {
    this.cmd = 'uname -a'
    this.bullseye = '6.1'
    this.bookworm = '6.6'
    this.kernel_version = execSync('uname -a').toString().match(/(?<version>\d+.\d+.\d+)/).groups.version
    this.pins = {}
    console.log('kernel class kernel version', this.kernel_version)
  }

  compareVersions() {
    const current_version = this.kernel_version
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

  getImage() {
    let kernel = this.compareVersions()
    let image = kernel > 0 ? 'bookworm' : 'bullseye'
    return image
  }

}

export { KernelVersion }
import { execSync } from 'child_process'

class KernelVersion {
  constructor() {
    this.cmd = 'uname -a'
    this.bullseye = '6.1'
    this.bookworm = '6.6'
    this.kernel_version = execSync('uname -a').toString().match(/(?<version>\d+.\d+.\d+)/).groups.version
    console.log('kernel class kernel version', this.kernel_version)
  }

  // async getVersion() {
  //   return new Promise((resolve, reject) => {
  //     exec(this.cmd, async (err, stdout, stderr) => {
  //       if (err) {
  //         console.log(`command error ${this.cmd}; ${stderr}`)
  //         reject(err)
  //         return
  //       }

  //       console.log('get version stdout', stdout)
  //       let kernel_version = stdout.match(/(?<version>\d+.\d+.\d+)/)
  //       console.log('get version kernel', kernel_version.groups.version)
  //       resolve(kernel_version.groups.version)
  //     })
  //   }).then((values) => {
  //     return values
  //   })

  // }

  compareVersions() {
    const current_version = this.kernel_version
    console.log('kernel version', current_version)

    let cur_components = current_version.split('.')
    // let bookworm_components = this.bookworm.split('.')
    let bullseye_components = this.bullseye.split('.')

    let len = Math.min(cur_components, bullseye_components)

    for (let i = 0; i < len; i++) {
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
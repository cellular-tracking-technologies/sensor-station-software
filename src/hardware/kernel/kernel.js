import { exec } from 'child_process'

class KernelVersion {
  constructor() {
    this.cmd = 'uname -a'
    this.bullseye = '6.1'
    this.bookworm = '6.6'
  }

  async getVersion() {
    return new Promise((resolve, reject) => {
      exec(this.cmd, async (err, stdout, stderr) => {
        if (err) {
          console.log(`command error ${this.cmd}; ${stderr}`)
          reject(err)
          return
        }

        console.log('get version stdout', stdout)
        let kernel_version = stdout.match(/(?<version>\d+.\d+.\d+)/)
        console.log('get version kernel', kernel_version.groups.version)
        resolve(kernel_version.groups.version)
      })
    }).then((values) => {
      return values
    })

  }

  async compareVersions() {
    const current_version = await this.getVersion()
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

  async getImage() {
    let kernel = await compareVersions()
    let image = kernel > 0 ? 'bookworm' : 'bullseye'
    return image
  }


}

let kernel = new KernelVersion
let kernel_version = kernel.getVersion().then((values) => { return values }).catch((e) => { console.error(e) })
export default kernel_version
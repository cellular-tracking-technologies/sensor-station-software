import { exec } from 'child_process'

class KernelVersion {
  constructor() {
    this.cmd = 'uname -a'
    this.bullseye = '6.1'
    this.bookworm = '6.6'
  }

  async getVersion() {
    try {
      await exec(this.cmd, async (err, stdout, stderr) => {
        console.log('get version stdout', stdout)
        let kernel_version = await stdout.match(/(?<version>\d+.\d+.\d+)/)
        console.log('get version kernel', kernel_version)

        return kernel_version.groups.version

      })
    } catch (err) {
      console.error(err)
    }
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
export { KernelVersion }
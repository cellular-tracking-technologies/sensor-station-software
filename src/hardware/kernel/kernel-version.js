import { exec } from 'child_process'

class KernelVersion {
  constructor() {
    this.cmd = 'uname -a'
  }

  async getVersion() {
    try {
      exec(this.cmd, async (err, stdout, stderr) => {
        console.log('get version stdout', stdout)
        let kernel_version = stdout.match(/(?<version>\d+.\d+.\d+)/)
        console.log('get version kernel', kernel_version.groups.version)

        return kernel_version.groups.version

      })
    } catch (err) {
      console.error(err)
    }
  }

  async compareVersions() {
    let current_version = await this.getVersion()
    console.log('kernel version', current_version)
  }


}
export { KernelVersion }
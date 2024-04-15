import { exec } from 'child_process'
// import command from '../../command'

class WifiSignal {
  constructor() {
    this.cmd = 'iwconfig | grep "Link Quality"'
  }

  async getWifiSignal() {
    return new Promise((resolve, reject) => {

      // command(this.cmd)
      exec(this.cmd, (error, stdout, stderr) => {
        if (error) {
          console.log(`command error ${this.cmd}; ${stderr}`)
          reject(error)
          return
        }
        const text = stdout
        const key = text.match(/(?<numerator>\d+)(?:\/)(?<denominator>\d+)/)
        const num = Number(key.groups.numerator)
        const den = Number(key.groups.denominator)
        const percent = Math.floor((num / den) * 100)
        resolve(percent)
      })

    }).then((values) => {
      return values
    })
  }
}
export default WifiSignal
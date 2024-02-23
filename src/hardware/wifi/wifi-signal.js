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
        const key = text.match(/(Link Quality)/g)
        const fraction = text.match(/(\d\d[\/]\d\d)/g)
        const num = Number(fraction[0].split("/")[0])
        const den = Number(fraction[0].split('/')[1])
        const percent = Math.floor((num / den) * 100)
        console.log('percent', percent)
        // const percent_string = `${Math.floor((num / den) * 100)}%`
        resolve(percent)
      })

    }).then((values) => {
      return values
    })
  }
}
export { WifiSignal }
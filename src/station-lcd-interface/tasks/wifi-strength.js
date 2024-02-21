import { exec } from 'child_process'

class WifiStrength {
  constructor() {
    this.header = "WiFi Signal Strength"
    this.percent
    this.cmd = 'iwconfig | grep "Link Quality"'
  }
  loading() {
    return [this.header]
  }





  results() {
    return new Promise((resolve, reject) => {

      let cmd = this.cmd
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.log(`command error ${cmd}; ${stderr}`)
          reject(error)
          return
        }
        const text = stdout
        const key = text.match(/(Link Quality)/g)
        const fraction = text.match(/(\d\d[\/]\d\d)/g)
        const num = Number(fraction[0].split("/")[0])
        const den = Number(fraction[0].split('/')[1])
        let percent = `${Math.floor((num / den) * 100)}%`
        resolve(percent)
      })

    }).then((values, resolve, reject) => {
      let rows = [this.header]
      rows.push(values)
      return rows
    }).catch((e) => {
      console.error(e)
    })
  }
}

export { WifiStrength }
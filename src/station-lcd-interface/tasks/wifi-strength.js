import { exec } from 'child_process'

class WifiStrength {
  constructor() {
    this.header = "WiFi Signal Strength"
    this.cmd = 'iwconfig | grep "Link Quality"'
  }
  loading() {
    return [this.header]
  }

  results() {
    return new Promise((resolve, reject) => {

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
      let rows = [this.header]
      let bars, bar0, bar1, bar2
      if (values > 75) {

        bar0 = String.fromCharCode(0xff)
        rows.push(bar0)
        bar1 = String.fromCharCode(0xff, 0xff)
        rows.push(bar1)
        bar2 = String.fromCharCode(0xff, 0xff, 0xff)
        rows.push(bar2)

        console.log('high strength', rows)
      } else if (values <= 75 && values > 50) {
        bar0 = String.fromCharCode(0xff)
        rows.push(bar0)
        bar1 = String.fromCharCode(0xff, 0xff)
        console.log('med strength', rows)
      } else if (values <= 50 && values > 25) {
        bar0 = String.fromCharCode(0xff)
        rows.push(bar0)
        console.log('low strength', rows)
      } else if (values <= 25 && values > 0) {
        bars = 0x10
        console.log('no strength', rows)
      }

      console.log('rows', rows)
      return rows
    }).catch((e) => {
      console.error(e)
    })
  }
}

export { WifiStrength }
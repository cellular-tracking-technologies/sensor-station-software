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
      let bars
      if (values > 75) {

        let bar0 = String.fromCharCode(0xff)
        rows.push(bar0)
        let bar1 = String.fromCharCode(0xff, 0xff)
        rows.push(bar1)
        let bar2 = String.fromCharCode(0xff, 0xff, 0xff)
        rows.push(bar2)

        console.log('high strength', bars)
      } else if (values <= 75 && values > 50) {
        // bars = 0x1c
        console.log('med strength', bars)
      } else if (values <= 50 && values > 25) {
        bars = 0x18
        console.log('low strength', bars)
      } else if (values <= 25 && values > 0) {
        bars = 0x10
        console.log('no strength', bars)
      } else {
        bars = 0
        console.log('no wifi', bars)
      }

      console.log('bars', bars)
      // rows.push(values)
      // rows.push(bars.toString())
      // let str = bars
      //   .map((hex) => {
      //     return String.fromCharCode(hex);
      //   })
      //   .join("");
      // rows.push(str)

      // rows.push(bars)

      console.log('rows', rows)
      return rows
    }).catch((e) => {
      console.error(e)
    })
  }
}

export { WifiStrength }
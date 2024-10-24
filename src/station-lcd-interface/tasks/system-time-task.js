import os from 'os'
import { exec } from 'child_process'
import url from 'url'
import fetch from 'node-fetch'
import moment from 'moment'

class SystemTimeTask {
  constructor(base_url, refresh = 1000) {
    this.url = url.resolve(base_url, 'gps')
    this.header = "Time"
    this.autoRefresh = refresh
  }
  loading() {
    return [this.header, "Loading..."]
  }
  results() {
    return new Promise((resolve, reject) => {

      const timeFunctions = [
        this.rtcTime(),
        this.gpsTime(),
        this.sysTime()
      ]
      Promise.all(timeFunctions).then((results) => {
        let times = []
        results.forEach((time) => {
          let dt = moment(new Date(time)).utc().format('YY-MM-DD HH:mm:ss')
          times.push(dt.toString())
        })
        resolve([
          this.header,
          `r: ${times[0]}`,
          `g: ${times[1]}`,
          `s: ${times[2]}`,
        ])
      }).catch((err) => {
        resolve([this.header, "error"])
      })
    })
  }
  rtcTime() {
    return new Promise((resolve, reject) => {
      let output = ""
      let child = exec('hwclock -r', (error, stdout, stderr) => {
        if (error) {
          resolve(null)
        }
      })
      child.stdout.on('data', (data) => {
        output += data
      })
      child.on('close', (code) => {
        resolve(output)
      })
    })
  }
  gpsTime() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {
          resolve(res.gps.time)
        })
        .catch(error => {
          resolve(null)
        })
    })
  }
  sysTime() {
    return new Promise((resolve, reject) => {

      let ts = Date.now()

      let date = new Date(ts)
      let year = date.getFullYear()
      let mon = date.getMonth() + 1
      let day = date.getDate()

      let hour = date.getHours()
      let min = date.getMinutes()
      let sec = date.getSeconds()

      const time_string = `${year}-${mon}-${day} ${hour}:${min}:${sec}`

      resolve(time_string)
    })
  }
}

export { SystemTimeTask }

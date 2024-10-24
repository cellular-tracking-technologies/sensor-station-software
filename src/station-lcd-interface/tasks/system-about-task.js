import fetch from 'node-fetch'
import url from 'url'

class SystemImageTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'about')
    this.header = "System Image"
  }
  loading() {
    return [this.header, "Loading..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {
          resolve([
            this.header,
            `image: ${res.station_image}`,
            `update: ${res.station_software}`
          ])
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }
}

class SystemIdsTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'about')
    this.header = "System Ids"
  }
  loading() {
    return [this.header, "Loading..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {
          resolve([this.header, res.station_id, res.serial, `${res.hardware} ${res.revision}`])
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }
}

class SystemMemoryTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'about')
    this.header = "System Memory"
  }
  loading() {
    return [this.header, "Loading..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {

          let percent_free_ram = res.free_mem / res.total_mem * 100
          if (typeof percent_free_ram !== undefined) {
            percent_free_ram = percent_free_ram.toFixed(2)
          }

          let percent_free_disk = res.disk_usage.available / res.disk_usage.total * 100
          if (typeof percent_free_disk !== undefined) {
            percent_free_disk = percent_free_disk.toFixed(2)
          }

          /*
              If either of the totals are Zero, we will get 'Infinity' for the percent_free
              value. Similarly if any of the res params are undefined, we will get 'NaN'. Instead
              of trying to manage those outcomes, simply print Infinity or NaN to the LCD. This 
              will make troubleshooting easier.
          */

          const ram = `ram:${(100 - percent_free_ram).toString()}% Used`
          const disk = `disk:${(100 - percent_free_disk).toString()}% Full`

          resolve([this.header, ram, disk])
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }
}

class SystemUptimeTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'about')
    this.header = "System Uptime"
  }
  loading() {
    return [this.header, "Loading..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {
          let uptime_hours = res.uptime / 3600
          if (typeof uptime_hours !== undefined) {
            uptime_hours = uptime_hours.toFixed(2)
          }
          resolve([this.header, `Hours:${uptime_hours.toString()}`])
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }
}

export { SystemImageTask, SystemIdsTask, SystemMemoryTask, SystemUptimeTask }
import os from 'os'

class HostnameTask {
  constructor() {
    this.header = "Hostname"
  }
  loading() {
    return [this.header]
  }
  results() {
    return new Promise((resolve, reject) => {
      resolve([this.header, os.hostname() + '.local'])
    })
  }
}

export { HostnameTask }
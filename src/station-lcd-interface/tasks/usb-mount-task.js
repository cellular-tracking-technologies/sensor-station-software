import fetch from 'node-fetch'
import url from 'url'

class MountUsbTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'usb/mount')
    this.header = "Usb"
  }
  loading() {
    return [this.header, "Mounting..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {
          resolve([this.header, `Mount:${res.status}`])
        })
        .catch(error => {
          resolve([this.header, `Mount:error`])
        })
    })
  }
}

export { MountUsbTask }
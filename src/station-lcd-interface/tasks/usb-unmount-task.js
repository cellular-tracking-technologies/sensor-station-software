import fetch from 'node-fetch'
import url from 'url'

class UnmountUsbTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'usb/unmount')
    this.header = "Usb"
  }
  loading() {
    return [this.header, "Unmounting..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {
          resolve([this.header, `Unmount:${res.status}`])
        })
        .catch(error => {
          resolve([this.header, `Unmount:error`])
        })
    })
  }
}

export { UnmountUsbTask }
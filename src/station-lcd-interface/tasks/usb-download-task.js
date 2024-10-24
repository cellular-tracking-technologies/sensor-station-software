import fetch from 'node-fetch'
import url from 'url'

class UsbDownloadTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'usb/data')
    this.header = "Usb"
  }
  loading() {
    return [this.header, "Downloading..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {
          resolve([this.header, `Download:${res.status}`])
        })
        .catch(error => {
          resolve([this.header, `Download:error`])
        })
    })
  }
}

export { UsbDownloadTask }
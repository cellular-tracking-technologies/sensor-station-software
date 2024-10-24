import fetch from 'node-fetch'
import url from 'url'

class QaqcRequest {
  constructor(base_url) {
    this.url = url.resolve(base_url, '/radio/qaqc')
    this.header = "QAQC Request"
  }
  loading() {
    return [this.header, "Request In Progress..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(res => {
          resolve([this.header, "Request Received"])
        })
        .catch(error => {
          resolve([this.header, `Request Error`])
        })
    })
  }
}

export { QaqcRequest }
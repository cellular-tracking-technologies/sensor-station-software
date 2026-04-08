import fetch from 'node-fetch'
import url from 'url'

class ServerConnectRequest {
  constructor(base_url) {
    this.url = url.resolve(base_url, '/radio/checkin')
    this.internet_url = url.resolve(base_url, '/internet/status')
    this.header = "Connect Request"
  }
  loading() {
    return [this.header, "Request In Progress..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.internet_url)
        .then(res => res.json())
        .then(json => {
          if (json.success < 3) {
            resolve([this.header, "Request Error", "No Internet"])
            return
          }
          fetch(this.url)
            .then(res => {
              resolve([this.header, "Request Received"])
            })
            .catch(error => {
              resolve([this.header, "Request Error"])
            })
        })
        .catch(error => {
          resolve([this.header, "Request Error"])
        })
    })
  }
}

export { ServerConnectRequest }
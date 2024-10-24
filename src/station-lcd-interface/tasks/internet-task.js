import fetch from 'node-fetch'
import url from 'url'

class InternetTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'internet/status')
    this.header = "Internet"
  }
  loading() {
    return [this.header, "Pinging..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {
          const connectedString = res.success > 0 ? "Connected" : "Disconnected"
          resolve([this.header, `${connectedString}`])
        })
        .catch(error => {
          resolve([this.header, `Error`])
        })
    })
  }
}

export { InternetTask }
import fetch from 'node-fetch'
import url from 'url'

class LedTask {
  constructor(base_url, options) {
    this.url = url.resolve(base_url, options.endpoint)
    this.header = options.header
    this.body = JSON.stringify({
      state: options.state,
      blink_rate_ms: 250
    })
  }
  loading() {
    return [this.header, "Loading..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      fetch(this.url, {
        method: "post",
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: this.body
      }).then(data => {
        return data.json()
      })
        .then(res => {
          resolve([this.header, "Done!"])
        })
        .catch(error => {
          console.log(error)
          resolve([this.header, `error`])
        })
    })
  }
}

export { LedTask }
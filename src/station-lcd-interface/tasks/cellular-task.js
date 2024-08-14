import fetch from 'node-fetch'
import url from 'url'

class CellularCarrier {
  constructor(base_url, refresh = 1000) {
    this.url = url.resolve(base_url, 'modem')
    this.header = "Carrier Info"
    this.autoRefresh = refresh
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
          let carrier = res.carrier
          let signal = res.signal.toString()

          resolve([this.header, carrier, signal])
          // resolve([this.header, res.carrier, res.signal])
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }
}

class CellularIds {
  constructor(base_url, refresh = 1000) {
    this.url = url.resolve(base_url, 'modem')
    this.header = "Modem Ids"
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
          resolve([this.header, res.sim, res.imei, res.info])
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }
}

export { CellularIds, CellularCarrier }
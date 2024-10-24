import fetch from 'node-fetch'
import url from 'url'

class GpsTask {
  constructor(base_url, refresh = 1000) {
    this.url = url.resolve(base_url, 'gps')
    this.header = "Location"
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
          resolve([this.header, `Lat:${res.mean.lat}`, `Lon:${res.mean.lng}`])
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }
}

export { GpsTask }
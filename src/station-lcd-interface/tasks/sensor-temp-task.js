import fetch from 'node-fetch'
import url from 'url'
class SensorTemperatureTask {
  constructor(base_url, refresh = 5000) {
    this.url = url.resolve(base_url, 'sensor/temperature')
    this.header = "Temperature"
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
          resolve([this.header, `Temp:${res.celsius}C [${res.fahrenheit}F]`])
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }
}

export { SensorTemperatureTask }
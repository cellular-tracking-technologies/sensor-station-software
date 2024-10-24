import fetch from 'node-fetch'
import url from 'url'
class SensorVoltageTask {
  constructor(base_url, refresh = 5000) {
    this.url = url.resolve(base_url, 'sensor/voltages')
    this.header = "Voltages"
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
          resolve([this.header, `Battery:${res.battery}`, `Rtc:${res.rtc}`, `Solar:${res.solar}`])
        })
        .catch(error => {
          resolve([this.header, `error`])
        })
    })
  }
}

export { SensorVoltageTask }
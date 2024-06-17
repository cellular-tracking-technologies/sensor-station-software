import fetch from 'node-fetch'
import url from 'url'
import exec from 'node:child_process'

class EnableWifi {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'internet/enable-wifi')
        this.header = "Enable WiFi"

    }
    loading() {
        return [this.header, "Enabling WiFi..."]
    }
    results() {
        return new Promise((resolve, reject) => {
            fetch(this.url)
                .then(data => {
                    console.log('data', data)
                    return data.json()
                })
                .then(res => {
                    resolve([this.header, `WiFi enabled:${res.status}`])
                })
                .catch(error => {
                    resolve([this.header, `WiFi:error`])
                })
        })
    }
}

class DisableWifi {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'internet/disable-wifi')
        this.header = "Disable WiFi"

    }
    loading() {
        return [this.header, "Disabling WiFi..."]
    }
    results() {
        return new Promise((resolve, reject) => {
            fetch(this.url)
                .then(data => {
                    console.log('data', data)
                    return data.json()
                })
                .then(res => {
                    resolve([this.header, `WiFi disabled:${res.status}`])
                })
                .catch(error => {
                    resolve([this.header, `WiFi:error`])
                })
        })
    }
}

export { EnableWifi, DisableWifi }



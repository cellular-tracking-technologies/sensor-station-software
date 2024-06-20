import fetch from 'node-fetch'
import url from 'url'

class EnableModem {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'modem/enable-modem')
        this.header = "Enable modem"

    }
    loading() {
        return [this.header, "Enabling Cell Modem..."]
    }
    results() {
        return new Promise((resolve, reject) => {
            fetch(this.url)
                .then(data => {
                    return data
                })
                .then(res => {
                    resolve([this.header, `Modem enabled:${res.statusText}`])
                })
                .catch(error => {
                    resolve([this.header, `Modem:error`])
                })
        })
    }
}

class DisableModem {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'modem/disable-modem')
        this.header = "Disable modem"

    }
    loading() {
        return [this.header, "Disabling modem..."]
    }
    results() {
        return new Promise((resolve, reject) => {
            fetch(this.url)
                .then(data => {
                    return data
                })
                .then(res => {
                    resolve([this.header, `modem disabled:${res.statusText}`])
                })
                .catch(error => {
                    resolve([this.header, `modem:error`])
                })
        })
    }
}

export { EnableModem, DisableModem }



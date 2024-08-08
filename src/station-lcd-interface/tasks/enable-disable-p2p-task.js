import fetch from 'node-fetch'
import url from 'url'

class EnableP2P {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'internet/enable-p2p')
        this.header = "Enable P2P"

    }
    loading() {
        return [this.header, "Enabling P2P..."]
    }
    results() {
        return new Promise((resolve, reject) => {
            fetch(this.url)
                .then(data => {
                    return data
                })
                .then(res => {
                    resolve([this.header, `P2P enabled:${res.statusText}`])
                })
                .catch(error => {
                    resolve([this.header, `P2P:error`])
                })
        })
    }
}

class DisableP2P {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'internet/disable-p2p')
        this.header = "Disable P2P"

    }
    loading() {
        return [this.header, "Disabling P2P..."]
    }
    results() {
        return new Promise((resolve, reject) => {
            fetch(this.url)
                .then(data => {
                    return data
                })
                .then(res => {
                    resolve([this.header, `P2P disabled:${res.statusText}`])
                })
                .catch(error => {
                    resolve([this.header, `P2P:error`])
                })
        })
    }
}

export { EnableP2P, DisableP2P }



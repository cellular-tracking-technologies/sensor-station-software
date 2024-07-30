import fetch from 'node-fetch'
import url from 'url'

class ProgramRadios {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'program-radios')
        this.header = "Program Radios"
    }
    loading() {
        return [this.header, "Programming..."]
    }
    results() {
        return new Promise((resolve, reject) => {
            fetch(this.url)
                .then(data => {
                    return data
                })
                .then(res => {
                    // resolve([this.header, `:${res.statusText}`])
                    resolve([this.header, 'Radios updated to', 'latest firmware'])
                })
                .catch(error => {
                    resolve([this.header, `Could not program radios`])
                })
        })
    }
}

export { ProgramRadios }
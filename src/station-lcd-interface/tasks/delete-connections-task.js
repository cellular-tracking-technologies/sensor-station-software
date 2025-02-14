import fetch from 'node-fetch'
import url from 'url'

class DeleteConnections {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'internet/delete-connections')
        this.header = "Delete Connections"

    }
    loading() {
        return [this.header, "Deleting..."]
    }
    results() {
        return new Promise((resolve, reject) => {
            fetch(this.url)
                .then(data => {
                    return data.json()
                })
                .then(res => {
                    const { status } = res
                    if (status === 'Success') {
                        resolve([this.header, `${status}`])
                    } else {
                        resolve([this.header, 'No credentials', 'to delete'])
                    }
                })
                .catch(error => {
                    resolve([this.header, `Deletion:error`])
                })
        })
    }
}

export { DeleteConnections }



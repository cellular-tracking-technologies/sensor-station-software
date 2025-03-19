import { exec } from 'child_process'

class DeleteDataTask {
    constructor() {
        this.header = "System"
    }
    loading() {
        return [this.header, "Deleting Data..."]
    }
    results() {
        return new Promise((resolve, reject) => {
            let child = exec('/bin/bash /lib/ctt/sensor-station-software/system/scripts/delete-data.sh', (error, stdout, stderr) => {
                if (error) {
                    resolve(null)
                }
            })
            child.stdout.on('data', (data) => {
                resolve(['All data deleted.'])
            })
        })
    }
}

export { DeleteDataTask }
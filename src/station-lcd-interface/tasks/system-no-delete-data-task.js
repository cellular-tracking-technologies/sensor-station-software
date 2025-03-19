import { exec } from 'child_process'
import url from 'url'


class NoDeleteDataTask {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'about')
        this.header = "Delete Data"
        this.start_disk
        this.curr_disk
    }

    getDisk() {
        fetch(this.url)
            .then(data => {
                return data.json()
            })
            .then(res => {

                let percent_free_disk = res.disk_usage.available / res.disk_usage.total * 100
                if (typeof percent_free_disk !== undefined) {
                    percent_free_disk = percent_free_disk.toFixed(2)
                }

                const disk = `${(100 - percent_free_disk).toFixed(2).toString()}% Full`
                console.log('disk', disk)

                return disk
            })
    }

    loading() {
        return [this.header, "Not Deleting Data"]
    }
    results() {
        return new Promise((resolve, reject) => {

            fetch(this.url)
                .then(data => {
                    return data.json()
                })
                .then(res => {

                    let percent_free_disk = res.disk_usage.available / res.disk_usage.total * 100
                    if (typeof percent_free_disk !== undefined) {
                        percent_free_disk = percent_free_disk.toFixed(2)
                    }
                    this.start_disk = `${(100 - percent_free_disk).toFixed(2).toString()}% Full`

                    resolve(['No data deleted.', `Disk Start ${this.start_disk}`, `Disk Now ${this.start_disk}`])

                })


        })

    }
}

export { NoDeleteDataTask }
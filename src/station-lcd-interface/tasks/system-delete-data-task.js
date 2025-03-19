import { exec } from 'child_process'
import url from 'url'


class DeleteDataTask {
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
    return [this.header, "Deleting Data..."]
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
        })
      // this.start_disk = this.getDisk()

      let child = exec('/bin/bash /lib/ctt/sensor-station-software/system/scripts/delete-data.sh', (error, stdout, stderr) => {
        if (error) {
          resolve(null)
        }
      })

      fetch(this.url)
        .then(data => {
          return data.json()
        })
        .then(res => {

          let percent_free_disk = res.disk_usage.available / res.disk_usage.total * 100
          if (typeof percent_free_disk !== undefined) {
            percent_free_disk = percent_free_disk.toFixed(2)
          }
          this.curr_disk = `${(100 - percent_free_disk).toFixed(2).toString()}% Full`
        })

      child.stdout.on('data', (data) => {
        // this.curr_disk = this.getDisk()

        console.log('start disk', this.start_disk, 'current disk', this.curr_disk)
        // console.log('system memory data', JSON.parse(data))
        // const { memory, disk } = JSON.parse(data)
        resolve(['All data deleted.', `Disk Start ${this.start_disk}`, `Disk Now ${this.curr_disk}`])
      })
    })

  }
}

export { DeleteDataTask }
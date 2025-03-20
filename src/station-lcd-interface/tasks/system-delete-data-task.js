import { exec } from 'child_process'
import url from 'url'
import Os from '../../hardware/pi/os.js'


class DeleteDataTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'about')
    this.header = "Delete Data"
    this.start_disk
    this.curr_disk
    this.disk_usage = Os.disk_usage
  }

  /**
   * return (<Promise>)
   */
  async getDisk() {
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
      })
      .then(result => result)
  }

  loading() {
    return [this.header, "Deleting Data..."]
  }
  results() {
    const start_disk = this.getDisk().then(results => results)
    return new Promise((resolve, reject) => {
      const disk_usage = Os.disk_usage
      console.log('disk usage', this.disk_usage)
      let child = exec('/bin/bash /lib/ctt/sensor-station-software/system/scripts/delete-data.sh', (error, stdout, stderr) => {
        if (error) {
          resolve(null)
        }
      })

      child.stdout.on('data', (data) => {
        console.log('data', data)
        const json_data = JSON.parse(data)
        this.start_disk = json_data.start_disk
        this.curr_disk = json_data.current_disk

        resolve(['All data deleted.', `Disk Start ${this.start_disk}`, `Disk Now ${this.curr_disk}`])

      })
      // const curr_disk = this.getDisk()

      // console.log('start disk', start_disk, 'current disk', curr_disk)
      // console.log('system memory data', JSON.parse(data))
      // const { memory, disk } = JSON.parse(data)
    })
  }
}

export { DeleteDataTask }
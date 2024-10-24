import { exec } from 'child_process'

class SystemRestartTask {
  constructor() {
    this.header = "System"
  }
  loading() {
    return [this.header, "Restarting..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      let child = exec('shutdown -r now', (error, stdout, stderr) => {
        if (error) {
          resolve(null)
        }
      })
      child.stdout.on('data', (data) => {
      })
      child.on('close', (code) => {
        resolve(null)
      })
    })
  }
}

export { SystemRestartTask }
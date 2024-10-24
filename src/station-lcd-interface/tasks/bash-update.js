import { execFile } from 'child_process'

class BashUpdateTask {
  constructor() {
    this.header = "Bash Update Station"
  }
  loading() {
    return [this.header, "Running ..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      console.log('executing bash update')
      execFile('bash-update-station', (error, stdout, stderr) => {
        if (error) {
          resolve([this.header, 'run error'])
          return
        }
        console.log(stdout)
        resolve([this.header, 'finished'])
      })
    })
  }
}

export { BashUpdateTask }
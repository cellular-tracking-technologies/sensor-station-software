import { execFile } from 'child_process'

// update-station stops station-lcd-interface for the length of the update (and
// restarts it on exit). A plain child of this service would be killed with it, so
// launch the update in its own transient systemd unit instead. Output goes to
// `journalctl -u ctt-lcd-update-station`.
const UNIT = 'ctt-lcd-update-station'

class UpdateStationTask {
  constructor() {
    this.header = "Update Station"
  }
  loading() {
    return [this.header, "Starting ..."]
  }
  results() {
    return new Promise((resolve, reject) => {
      console.log('starting update-station')
      execFile('systemd-run', ['--unit', UNIT, '--collect', '/usr/local/sbin/update-station'], (error, stdout, stderr) => {
        if (error) {
          // systemd-run refuses a unit name that is still active
          console.error('update-station launch failed', stderr)
          resolve([this.header, /already/i.test(stderr) ? 'already running' : 'run error'])
          return
        }
        resolve([this.header, 'update started'])
      })
    })
  }
}

export { UpdateStationTask }

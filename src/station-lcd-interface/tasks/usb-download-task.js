import fetch from 'node-fetch'
import url from 'url'
import display from '../display-driver.js'

const DOWNLOAD_TIMEOUT_MS = 1000 * 60 * 10 // 10 minute timeout to match server-side
const PROGRESS_POLL_MS = 2000
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 5000
const BLOCK = String.fromCharCode(0xFF) // solid filled block on HD44780
const SPACE = " "                        // empty cell

class UsbDownloadTask {
  constructor(base_url) {
    this.url = url.resolve(base_url, 'usb/data')
    this.progressUrl = url.resolve(base_url, 'usb/data/progress')
    this.header = 'Downloading to USB...'
    this.retryCount = 0
  }
  loading() {
    this.pollProgress()
    return [this.header, "Downloading...", SPACE.repeat(20), "0%"]
  }
  progressBar(copied, total) {
    const barWidth = 20
    if (total === 0) return SPACE.repeat(barWidth)
    const filled = Math.min(Math.round((copied / total) * barWidth), barWidth)
    return BLOCK.repeat(filled) + SPACE.repeat(barWidth - filled)
  }
  /**
   * Build the four panel rows for a progress snapshot, or null when there is
   * nothing to repaint (idle, or a terminal state that results() renders).
   *
   * A copy pauses between files while the radio interface rotates data files, so
   * the panel has to explain itself rather than looking frozen — which is exactly
   * how the old build read when a copy stopped moving.
   */
  rowsFor(progress) {
    const status = progress.status
    const phase = progress.phase
    const copied = progress.copied || 0
    const total = progress.total || 0
    const pct = total > 0 ? Math.round((copied / total) * 100) : 0
    const bar = this.progressBar(copied, total)

    if (status === "paused") {
      return [this.header, phase === "rotating" ? "Data Rotating" : "Data Paused", bar, `${pct}%`]
    }
    if (status === "copying" && phase === "restarting") {
      // "Data Download Restart" is 21 characters — one wider than the panel — so
      // it is split across two rows instead of being silently truncated.
      return [this.header, "Data Download", "Restarting...", `${pct}%`]
    }
    if (status === "copying" && total > 0) {
      return [this.header, `${copied}/${total} files`, bar, `${pct}%`]
    }
    return null
  }

  fetchProgress() {
    fetch(this.progressUrl, { timeout: 3000 })
      .then(res => res.json())
      .then(progress => {
        console.log('usb download progress', progress)
        if (!progress) return
        const rows = this.rowsFor(progress)
        if (rows) {
          display.write(rows)
        }
      })
      .catch((err) => {
        console.log('usb download progress poll error', err.message)
      })
  }
  pollProgress() {
    this.fetchProgress()
    this.progressTimer = setInterval(() => {
      this.fetchProgress()
    }, PROGRESS_POLL_MS)
  }
  stopPolling() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
  }
  attemptDownload(resolve) {
    fetch(this.url, { timeout: DOWNLOAD_TIMEOUT_MS })
      .then(data => {
        return data.json()
      })
      .then(res => {
        this.stopPolling()
        this.retryCount = 0
        resolve([this.header, `Download:${res.status}`])
      })
      .catch(error => {
        console.log(`usb download error (attempt ${this.retryCount + 1}/${MAX_RETRIES + 1})`, error.message)
        if (this.retryCount < MAX_RETRIES) {
          this.retryCount++
          display.write([
            this.header,
            `Error - retrying...`,
            `Attempt ${this.retryCount + 1}/${MAX_RETRIES + 1}`,
            ""
          ])
          setTimeout(() => {
            this.attemptDownload(resolve)
          }, RETRY_DELAY_MS)
        } else {
          this.stopPolling()
          this.retryCount = 0
          if (error.type === 'request-timeout') {
            resolve([this.header, `Download:timeout`, "", "Press select to retry"])
          } else {
            resolve([this.header, `Download:error`, "", "Press select to retry"])
          }
        }
      })
  }
  results() {
    return new Promise((resolve, reject) => {
      this.attemptDownload(resolve)
    })
  }
}

export { UsbDownloadTask }

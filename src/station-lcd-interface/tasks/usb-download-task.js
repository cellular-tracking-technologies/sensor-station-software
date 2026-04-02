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
  fetchProgress() {
    fetch(this.progressUrl, { timeout: 3000 })
      .then(res => res.json())
      .then(progress => {
        console.log('usb download progress', progress)
        if (progress.status === "copying" && progress.total > 0) {
          const pct = Math.round((progress.copied / progress.total) * 100)
          display.write([
            this.header,
            `${progress.copied}/${progress.total} files`,
            this.progressBar(progress.copied, progress.total),
            `${pct}%`
          ])
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

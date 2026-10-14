import fs from 'fs'
import path from 'path'

// A pausable, resumable, bounded file-by-file copier.
//
// This exists because `ncp` — the previous copy engine for /usb/data — offers no
// way to pause or cancel a run in flight. The only lever against a wedged ncp was
// to unmount the volume underneath it and hope its callback fired, which is both
// violent and unreliable. Copying one file at a time gives us three things ncp
// could not:
//
//   1. PAUSE between files, so the radio interface can rotate data files without
//      racing the copy (rotation moves files out from under a tree walk, which is
//      what wedges ncp), then let the copy carry on.
//   2. A PER-FILE ceiling, so a single unwritable file fails that file instead of
//      hanging the whole download forever.
//   3. Progress counted in memory, so reporting progress never touches the USB
//      volume. The old count-based watchdog walked /mnt/usb synchronously on
//      every sample — if the mount hard-faulted, that walk blocked the whole
//      hardware-server event loop, including the timer meant to rescue the copy.
//
// Sequential copying is slower than ncp's parallel walk, but /data is a few
// megabytes of CSVs — the previous run moved 108 files totalling 3.3 MB — so the
// wall-clock cost is irrelevant next to being able to stop.

// Per-file ceiling. The largest file in /data is well under a megabyte, so a file
// that has not finished in this long is a wedged write, not a slow one.
const PER_FILE_TIMEOUT_MS = 60 * 1000

// A pause is requested by another service. If that service dies mid-pause the
// copy must not stay parked forever, so a pause self-releases after this long.
const MAX_PAUSE_MS = 2 * 60 * 1000

// Consecutive per-file timeouts that mean the volume itself is gone rather than
// one bad file. At that point stop and let the caller unmount to break the writes.
const MAX_CONSECUTIVE_TIMEOUTS = 3

// How often the run loop re-checks a pause it is parked on.
const PAUSE_POLL_MS = 250

// How long after a resume the queue keeps reporting the "restarting" phase, so a
// slow LCD poll (every 2 s) still catches the restart banner rather than blinking
// straight back to the progress bar.
const RESTART_BANNER_MS = 5 * 1000

class CopyQueue {
  /**
   * @param {object} opts
   * @param {string} opts.src - directory to copy from (local storage)
   * @param {string} opts.dest - directory to copy into (the USB mount point)
   * @param {number} [opts.deadlineMs] - hard ceiling for the whole run
   */
  constructor({ src, dest, deadlineMs = 20 * 60 * 1000 }) {
    this.src = src
    this.dest = dest
    this.deadlineMs = deadlineMs

    this.files = []
    this.total = 0
    this.copied = 0
    this.skipped = 0
    this.failed = []

    this.status = 'idle' // idle | copying | done | stalled | timeout | aborted
    this.phase = null // label shown on the LCD: paused | rotating | restarting
    this.paused = false
    this.paused_at = null
    this.resumed_at = null
    this.aborted = false
    this.abort_reason = null
    this.started_at = null
    this.current_file = null
    this.consecutive_timeouts = 0
  }

  /**
   * Build the work list. Walks the SOURCE tree only — never the USB volume — so a
   * faulted stick cannot block enumeration.
   * @returns {number} number of files queued
   */
  enumerate() {
    const walk = (dir, rel = '') => {
      let out = []
      let entries = []
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch (err) {
        // directory vanished (rotation) or was never there — nothing to copy
        return out
      }
      for (const entry of entries) {
        const abs = path.join(dir, entry.name)
        const rel_path = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          out = out.concat(walk(abs, rel_path))
        } else if (entry.isFile()) {
          let size = 0
          try {
            size = fs.statSync(abs).size
          } catch (err) {
            // file rotated away between readdir and stat; copy will skip it
          }
          out.push({ rel: rel_path, size })
        }
      }
      return out
    }

    this.files = walk(this.src)
    this.total = this.files.length
    return this.total
  }

  /**
   * Copy one file, bounded by PER_FILE_TIMEOUT_MS. On timeout both streams are
   * destroyed so the descriptors are released even if the write never completes.
   */
  copyFile(abs_src, abs_dest) {
    return new Promise((resolve, reject) => {
      try {
        fs.mkdirSync(path.dirname(abs_dest), { recursive: true })
      } catch (err) {
        reject(err)
        return
      }

      const read = fs.createReadStream(abs_src)
      const write = fs.createWriteStream(abs_dest)
      let settled = false

      const settle = (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        read.destroy()
        write.destroy()
        if (err) reject(err)
        else resolve()
      }

      const timer = setTimeout(() => {
        const err = new Error(`per-file timeout after ${PER_FILE_TIMEOUT_MS}ms`)
        err.code = 'ECOPYTIMEOUT'
        settle(err)
      }, PER_FILE_TIMEOUT_MS)

      read.on('error', settle)
      write.on('error', settle)
      // 'finish' means every byte reached the OS. The volume is flushed for real
      // when the caller unmounts, which is the existing download flow.
      write.on('finish', () => settle())
      read.pipe(write)
    })
  }

  /**
   * Park the run loop while paused. Self-releases after MAX_PAUSE_MS so a crashed
   * pauser cannot strand a copy.
   */
  async waitWhilePaused() {
    while (this.paused && !this.aborted) {
      if (Date.now() - this.paused_at > MAX_PAUSE_MS) {
        console.log(`copy-queue pause exceeded ${MAX_PAUSE_MS}ms — releasing it`)
        this.resume()
        break
      }
      await new Promise((r) => setTimeout(r, PAUSE_POLL_MS))
    }
  }

  /**
   * Run the queue to completion. Resolves with a result summary; it does not
   * reject — a failed file is recorded and the run continues.
   */
  async run() {
    this.started_at = Date.now()
    this.status = 'copying'
    if (!this.total) this.enumerate()

    for (const file of this.files) {
      if (this.aborted) break
      await this.waitWhilePaused()
      if (this.aborted) break

      if (Date.now() - this.started_at > this.deadlineMs) {
        this.status = 'timeout'
        break
      }

      const abs_src = path.join(this.src, file.rel)
      const abs_dest = path.join(this.dest, file.rel)

      // Already on the volume at the same size: count it and move on. This is
      // what makes a restart after a pause (or an aborted earlier run) resume
      // rather than recopy the whole tree.
      try {
        const existing = fs.statSync(abs_dest)
        if (existing.size === file.size) {
          this.skipped++
          this.copied++
          continue
        }
      } catch (err) {
        // not on the volume yet — copy it
      }

      this.current_file = file.rel
      try {
        await this.copyFile(abs_src, abs_dest)
        this.copied++
        this.consecutive_timeouts = 0
      } catch (err) {
        this.failed.push({ file: file.rel, error: err.message })
        console.log(`copy-queue failed on ${file.rel}: ${err.message}`)
        if (err.code === 'ECOPYTIMEOUT') {
          this.consecutive_timeouts++
          if (this.consecutive_timeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
            // Three files in a row timing out is a dead volume, not bad files.
            this.status = 'stalled'
            break
          }
        }
      } finally {
        this.current_file = null
      }
    }

    if (this.status === 'copying') {
      this.status = this.aborted ? 'aborted' : 'done'
    }
    return this.result()
  }

  /**
   * Request a pause. `phase` is a free-text label the LCD renders, so the panel
   * can say why the download stopped ('paused', 'rotating').
   *
   * Takes effect BETWEEN files: the file already in flight finishes first (bounded
   * by PER_FILE_TIMEOUT_MS). Callers that need the volume quiet before touching
   * the source tree should wait for `snapshot().current` to clear — the
   * /usb/data/pause route does this for them.
   */
  pause(phase = 'paused') {
    this.phase = phase
    if (this.paused) return
    this.paused = true
    this.paused_at = Date.now()
    console.log(`copy-queue paused (${phase}) at ${this.copied}/${this.total}`)
  }

  resume() {
    if (this.paused) {
      console.log(`copy-queue resumed at ${this.copied}/${this.total}`)
    }
    this.paused = false
    this.paused_at = null
    this.resumed_at = Date.now()
    this.phase = 'restarting'
  }

  abort(reason = 'aborted') {
    this.aborted = true
    this.abort_reason = reason
    this.paused = false
  }

  /**
   * Current state for /usb/data/progress. Derived entirely from in-memory
   * counters — this never touches the USB volume.
   */
  snapshot() {
    let status = this.status
    let phase = this.phase

    if (status === 'copying') {
      if (this.paused) {
        status = 'paused'
      } else if (!this.resumed_at || Date.now() - this.resumed_at > RESTART_BANNER_MS) {
        // restart banner has expired; back to plain progress reporting
        phase = null
      }
    }

    return {
      status,
      phase: phase || null,
      total: this.total,
      copied: Math.min(this.copied, this.total),
      skipped: this.skipped,
      failed: this.failed.length,
      current: this.current_file,
    }
  }

  result() {
    return {
      status: this.status,
      total: this.total,
      copied: Math.min(this.copied, this.total),
      skipped: this.skipped,
      failed: this.failed,
      abort_reason: this.abort_reason,
      elapsed_s: this.started_at ? ((Date.now() - this.started_at) / 1000).toFixed(1) : null,
    }
  }
}

export default CopyQueue
export { PER_FILE_TIMEOUT_MS, MAX_PAUSE_MS, MAX_CONSECUTIVE_TIMEOUTS, RESTART_BANNER_MS }

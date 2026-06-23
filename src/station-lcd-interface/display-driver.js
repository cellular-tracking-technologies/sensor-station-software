import LcdFramebuffer from './lcd-framebuffer.js'

// The character LCD is now actuated by the native ctt-lcd daemon, which renders
// a framebuffer this module publishes to /run/ctt/lcd. Display composites screens
// into an LcdFramebuffer (the same drawing API the old in-process I2C driver
// exposed) instead of opening the I2C bus. The menu/stats logic is unchanged —
// it still draws via `display` and `display.lcd`.
class Display {
  constructor(settings) {
    /** @private @const {number} Max characters per line. */
    this.columns_ = settings.columns

    /** @private @const {number} Max lines on the lcd. */
    this.rows_ = settings.rows

    /** @private @const {boolean} Mirror lcd output to the console. */
    this.debug_ = settings.debug

    /** @private {LcdFramebuffer} Virtual LCD published to /run/ctt/lcd. */
    this.lcd = new LcdFramebuffer({ cols: this.columns_, rows: this.rows_ })
  }

  /**
   * Hardware detection now lives in the native ctt-lcd daemon, so there is no
   * I2C scan here. Kept async for API compatibility with callers that await it.
   * @return {Promise<string>} Resolves 'ok'.
   */
  init() {
    return Promise.resolve('ok')
  }

  /**
   * Clears all data from the lcd screen.
   */
  clear() {
    if (this.lcd == null) {
      return
    }
    this.lcd.on()
    this.lcd.clear()
  }

  /**
   * Maps a list of strings to each row then writes to the lcd screen.
   * @param {Array<string>} rows - Data to be written to lcd.
   */
  write(rows) {
    if (this.lcd == null) {
      return
    }
    let line = 1
    this.clear()
    this.log_('')
    rows.forEach(element => {
      this.writeRow(element, line)
      this.log_(element)
      line++
    })
    this.log_('')
  }

  /**
   * Writes a string to a specific row of the lcd.
   * @param {string} data - Data to be written to lcd.
   * @param {number} row - Row of lcd to be written.
   */
  writeRow(data, row) {
    if (this.lcd == null) {
      return
    }
    if (typeof data != 'string') {
      throw TypeError
    }
    this.lcd.println(data, row)
  }

  /**
   * Renders a static message immediately, cancelling the debounced flush. Used
   * on shutdown so the panel shows the interface is no longer running instead of
   * leaving a stale, live-looking menu for the ctt-lcd daemon to keep
   * displaying. Synchronous so it completes before the process exits.
   * @param {Array<string>} rows - One string per LCD row (pad with '' for gaps).
   */
  writeNow(rows) {
    if (this.lcd == null) {
      return
    }
    let line = 1
    this.lcd.clear()
    rows.forEach(element => {
      this.writeRow(element, line)
      line++
    })
    this.lcd.flushNow()
  }

  /**
   * Wrapper around console.log() that can be switched on and off via this.debug_.
   * @param {*} data Information to be printed to the console.
   */
  log_(data) {
    if (this.debug_ == true) {
      console.log(data)
    }
  }
}

let display = new Display({
  columns: 20,
  rows: 4,
  debug: false
})

export default display

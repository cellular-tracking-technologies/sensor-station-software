import fs from 'fs'

// Virtual character-LCD backed by a framebuffer file. Presents the same drawing
// API the in-process I2C LCD driver did (clear / print / setCursor / createChar /
// println / on), but instead of touching the I2C bus it composites into an
// in-memory 20x4 cell grid + 8 CGRAM glyphs and flushes that as a fixed 144-byte
// image to /run/ctt/lcd. The native ctt-lcd daemon renders it onto the hardware,
// so this process never opens the bus.
//
// Framebuffer layout (matches ctt-lcd): bytes 0..63 = 8 glyphs x 8 row-bytes,
// bytes 64..143 = 80 cells row-major (4 rows x 20 cols); cell value 0-7 selects
// a CGRAM glyph, otherwise an HD44780 ROM code.
//
// Draw calls are coalesced: the flush is debounced ~50 ms after the last call so
// a multi-call screen render (e.g. the stats screen) becomes one repaint.

const LCD_FILE = '/run/ctt/lcd'
const COLS = 20
const ROWS = 4
const GLYPHS = 8
const GLYPH_BYTES = 8
const FLUSH_DELAY_MS = 50

class LcdFramebuffer {
  constructor({ cols = COLS, rows = ROWS, file = LCD_FILE } = {}) {
    this.cols = cols
    this.rows = rows
    this.file = file
    this.glyphs = Array.from({ length: GLYPHS }, () => new Uint8Array(GLYPH_BYTES))
    this.cells = Array.from({ length: rows }, () => new Uint8Array(cols).fill(0x20))
    this.cursor = { col: 0, row: 0 }
    this._timer = null
  }

  // Place the cursor (0-based col, row). Mirrors the JS LCD setCursor(x, y).
  setCursor(col, row) {
    this.cursor = { col, row }
    return this
  }

  // Write a string at the cursor, advancing left to right, clamped to the row.
  print(str) {
    if (typeof str !== 'string') return this
    let { col, row } = this.cursor
    if (row < 0 || row >= this.rows) return this
    for (const ch of str) {
      if (col >= this.cols) break
      this.cells[row][col] = ch.charCodeAt(0) & 0xff
      col++
    }
    this.cursor.col = col
    this._scheduleFlush()
    return this
  }

  // Write a whole line (1-based, matching the JS println), truncated to width.
  println(str, line) {
    if (typeof str !== 'string') return this
    if (line > 0 && line <= this.rows) this.setCursor(0, line - 1)
    return this.print(str.substring(0, this.cols))
  }

  // Define CGRAM glyph `ch` (0-7) from 8 row-bytes.
  createChar(ch, data) {
    const g = this.glyphs[ch & 0x07]
    for (let i = 0; i < GLYPH_BYTES; i++) g[i] = (data[i] || 0) & 0xff
    this._scheduleFlush()
    return this
  }

  // Clear the screen (cells -> space, cursor home).
  clear() {
    for (let r = 0; r < this.rows; r++) this.cells[r].fill(0x20)
    this.cursor = { col: 0, row: 0 }
    this._scheduleFlush()
    return this
  }

  // Backlight / display-on are owned by the daemon; kept as no-ops for API parity.
  on() { return this }
  off() { return this }
  home() { return this.setCursor(0, 0) }

  _scheduleFlush() {
    if (this._timer) return
    this._timer = setTimeout(() => {
      this._timer = null
      this._flush()
    }, FLUSH_DELAY_MS)
  }

  // Flush right now, cancelling any pending debounced write. For shutdown paths
  // where the process exits before the ~50 ms debounce timer would fire.
  flushNow() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this._flush()
    return this
  }

  // Serialize to the fixed 144-byte image and write atomically (temp + rename)
  // so the daemon never reads a half-written frame.
  _flush() {
    const buf = Buffer.alloc(GLYPHS * GLYPH_BYTES + this.rows * this.cols)
    let off = 0
    for (let g = 0; g < GLYPHS; g++) {
      buf.set(this.glyphs[g], off)
      off += GLYPH_BYTES
    }
    for (let r = 0; r < this.rows; r++) {
      buf.set(this.cells[r], off)
      off += this.cols
    }
    try {
      fs.writeFileSync(`${this.file}.tmp`, buf)
      fs.renameSync(`${this.file}.tmp`, this.file)
    } catch (err) {
      // /run/ctt missing or not writable (e.g. ctt-lcd not up yet) — ignore
    }
  }
}

export default LcdFramebuffer

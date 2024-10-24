import LCD from './lcdi2c.js'
import { exec } from 'child_process'

class Display {
  /**
   * @param {Object} settings
   *  
   */
  constructor(settings) {
    /** @private @const {number} columns Max characters that can be display on a single line. */
    this.columns_ = settings.columns

    /** @private @const {number} rows Max lines on the lcd. */
    this.rows_ = settings.rows

    /** @private @const {Array<number>} i2cAddresses Supported i2c-to-parallel converters for lcds. */
    this.i2cAddresses_ = settings.i2cAddresses

    /** @private @const {boolean} debug Data sent to lcd will also be routed to console.*/
    this.debug_ = settings.debug

    /** @private {Object} Physical driver for lcd screen. */
    this.lcd = null
  }
  /**
   * Retrieves all i2c addresses for a specified i2c port  
   * @param {number} i2c_port - Port number of the i2c bus to-be-searched.
   * @return {Promise<Object>} Resolve - Object with port and list of addresses.
   */
  scanI2cPort_(i2c_port) {
    return new Promise((resolve, reject) => {
      let output = ""
      let child = exec(`i2cdetect -y ${i2c_port}`, (error, stdout, stderr) => {
        if (error) {
          reject(error)
        }
      })

      child.stdout.on('data', (response) => {
        output += response
      })

      child.on('close', (code) => {

        let i2c = {
          addresses: [],
          port: i2c_port
        }

        output.split("\n")
          .filter(line => line.indexOf(":") > -1)
          .forEach(line => {
            let data = line.match(/ [A-Fa-f0-9]{2}/g)
            if (data != null) {
              i2c.addresses.push(...data.map(record => record.trim()))
            }
          })

        resolve(i2c)
      })
    })
  }
  /**
   * Attempts to initialize lcd by searching from a list of i2c addresses on a port.
   * @param {number} port i2c bus number 
   * @param {Array<number>} addresses List of i2c addresses present on 'bus'.
   * @return {boolean} True if the lcd was discovered. 
   */
  initLcd_(port, addresses) {

    let allowed = addresses.map((element) => {
      return parseInt(element, 16)
    }).filter(address => this.i2cAddresses_.includes(address))

    if (allowed.length == 0) {
      return false
    }

    this.lcd = new LCD(port, allowed[0], this.columns_, this.rows_) // https://github.com/craigmw/lcdi2c

    return true
  }
  /**
   * Initializes lcd by scanning i2c ports for supported device.
   * @return {Promise<string>} Returns 'ok' on resolve or error string for reject.
   */
  init() {
    return new Promise((resolve, reject) => {
      const i2cScans = [
        this.scanI2cPort_(0), // i2c-0
        this.scanI2cPort_(1)  // i2c-1
      ]
      Promise.all(i2cScans).then((results) => {
        results.forEach((i2c) => {
          if (this.initLcd_(i2c.port, i2c.addresses) == true) {
            resolve("ok")
            return
          }
        })
        reject("Display Not Found")
      }).catch((err) => {
        reject(err.toString())
      })
    })
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
    display.clear()
    this.log_("")
    rows.forEach(element => {
      display.writeRow(element, line)
      this.log_(element)
      line++
    })
    this.log_("")
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
  i2cAddresses: [0x3f, 0x27],
  debug: false
})

export default display

import i2c from '../../i2c/i2c.js'
import i2cscanner from '../../i2c/scan.js'

/**
 * utility to read temperature from TMP411 sensor chip
 */
class Tmp411 {
  #address = 0x4e

  constructor() {
    this.i2c = new i2c({
      address: this.#address,
      bus: 1,
    })

    this.device_detected = null

    this.registers = {
      CONFIG: {
        WRITE: 0x09,
        READ: 0x03,
      },
      READ: {
        LOCAL: {
          HIGH_BYTE: 0x00,
          LOW_BYTE: 0x15,
        },
        REMOTE: {
          HIGH_BYTE: 0x01,
          LOW_BYTE: 0x10,
        },
      },
      STATUS: 0x02,
    }
  }

  async detected() {
    // check that the device has been detected at least once
    if (this.device_detected === null) {
      // check has not been made - make it now
      console.log('first time TMP411 check')
      const addresses = await i2cscanner(1)
      if (addresses.includes(this.#address)) {
        // identified a device at the proper address
        console.log('TMP 411 detected')
        this.device_detected = true
      } else {
        console.log('TMP 411 not detected')
        this.device_detected = false
      }
    }
    return this.device_detected
  }

  /**
   * read configuration of tmp411 sensor
   */
  async readConfiguration() {
    const buffer = Buffer.alloc(1)
    await this.i2c.readRegister({
      register: this.registers.CONFIG.READ,
      buffer,
    })
    return buffer
  }

  /**
   * configure TMP411 chip to read temperature range -55C to 150C
   */
  async configure() {
    return this.i2c.writeRegister({
      register: this.registers.CONFIG.WRITE,
      buffer: Buffer.from([0b00000100])
    })
  }

  c_to_f(celsius) {
    return celsius * 9 / 5 + 32
  }

  /**
   * @typedef {Object} Temperature
   * @param {Number} celsius
   * @param {Number} fahrenheit
   */
  /**
   * read local temperature
   * @returns {Temperature}
   **/
  async readLocalTemperature() {
    // configure the tmp411 chip to extend temperature range
    const detected = await this.detected()
    if (detected === false) {
      // chip was not detected
      // return bad values
      return {
        celsius: -100,
        fahrenheit: -100,
      }
    }
    await this.configure()
    // read the low byte from the register
    const low_byte = Buffer.alloc(1)
    await this.i2c.readRegister({
      register: this.registers.READ.LOCAL.LOW_BYTE,
      buffer: low_byte,
    })
    // read the high byte from the register
    const high_byte = Buffer.alloc(1)
    await this.i2c.readRegister({
      register: this.registers.READ.LOCAL.HIGH_BYTE,
      buffer: high_byte,
    })
    const high = high_byte.readUInt8()
    const low = low_byte.readUInt8()
    const offset = 0x40
    // extended range offset
    let celsius = high - offset
    // account for decimal fraction
    if (low === 128) celsius += 0.5
    return {
      celsius,
      fahrenheit: this.c_to_f(celsius)
    }
  }
}

export default Tmp411

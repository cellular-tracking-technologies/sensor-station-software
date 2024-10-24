// https://github.com/fivdi/i2c-bus#readme
import i2c from 'i2c-bus'

/**
 * i2c interface for reading / writing
 */
class I2C {
  #address
  #bus
  /**
   * 
   * @param {Object} opts
   * @param {Number} opts.address
   * @param {Number} opts.bus
   */
  constructor(opts) {
    this.#address = opts.address
    this.#bus = opts.bus
  }

  /**
   * 
   * @typedef {Object} RegisterInput
   * @property {Number} register
   * @property {Buffer} buffer
  */

  /**
   * write provided buffer to given register address
   * @param {RegisterInput}
   */
  async writeRegister(opts) {
    const i2c1 = await i2c.openPromisified(this.#bus)
    let results = await i2c1.writeI2cBlock(this.#address, opts.register, opts.buffer.length, opts.buffer)
    await i2c1.close()
    return results
  }

  /**
   * write buffer to i2c instance
   * @param {Buffer} buffer 
   */
  async write(buffer) {
    const i2c1 = await i2c.openPromisified(this.#bus)
    let results = await i2c1.i2cWrite(this.#address, buffer.length, buffer)
    await i2c1.close()
    return results
  }

  /**
   * 
   * @param {RegisterInput} opts
   * @returns 
   */
  async readRegister(opts) {
    const i2c1 = await i2c.openPromisified(this.#bus)
    let results = await i2c1.readI2cBlock(this.#address, opts.register, opts.buffer.length, opts.buffer)
    await i2c1.close()
    return results
  }

  /**
   * read from i2c address into provided buffer
   * @param {Buffer} buffer 
   */
  async read(buffer) {
    const i2c1 = await i2c.openPromisified(this.#bus)
    let results = await i2c1.i2cRead(this.#address, buffer.length, buffer)
    await i2c1.close()
    return results
  }

}

export default I2C

/**
 * AT24MAC602 Serial EEPROM Interface
 */
import I2C from '../i2c/i2c.js'

const ADDRESS = 0x58
const BUS = 1

// i2c control
const i2c = new I2C({
  address: ADDRESS,
  bus: BUS,
})

export default {
  /**
   * 
   * @returns {Promise<Buffer>} 8 byte buffer
   */
  ReadEUI64: async () => {
    // write device register for the ID
    const REGISTER = 0x98
    await i2c.write(Buffer.from([REGISTER]))
    const response_buffer = Buffer.alloc(8)
    const results = await i2c.read(response_buffer)
    // console.log('read', results.bytesRead, 'bytes from at24mac602 chip', results.buffer.toString('hex'))
    return results.buffer
  },
  /**
   * 
   * @returns  {Promise<Buffer>} 16 byte buffer 
   */
  ReadEUI128: async () => {
    const REGISTER = 0x80
    await i2c.write(Buffer.from([REGISTER]))
    const response_buffer = Buffer.alloc(16)
    const results = await i2c.read(response_buffer)
    // console.log('read', results.bytesRead, 'bytes from at24mac602 chip', results.buffer.toString('hex'))
    return results.buffer
  }
}

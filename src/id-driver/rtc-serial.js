import i2c from 'i2c-bus'

class RtcSerial {
  constructor() {
    this.i2c_address = 0x57
    this.command = 0xf0
  }

  async getId() {
    let buffer = Buffer.alloc(8)
    const i2c1 = await i2c.openPromisified(1)
    await i2c1.readI2cBlock(this.i2c_address, this.command, buffer.length, buffer)
    await i2c1.close()
    return buffer.toString('hex').toUpperCase()
  }
}

export default RtcSerial 

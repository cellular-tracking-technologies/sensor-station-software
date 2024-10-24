import i2c from 'i2c-bus'

class Max11645 {
  #address
  #bus
  constructor() {
    this.#address = 0x36
    this.#bus = 1
    this.reference_voltage = 3.3
    this.voltage_divider = 8.5
  }

  convertResponse(value) {
    // first mask 4 bits of last byte
    value = value ^ 0xf0
    const buffer = Buffer.alloc(2)
    // write to buffer as little endian
    buffer.writeUInt16LE(value)
    // read as big endian
    return buffer.readUInt16BE() * this.reference_voltage * this.voltage_divider / 4096
  }

  async setup() {
    const i2c1 = await i2c.openPromisified(this.#bus)
    const buffer = Buffer.from([0b10000010])
    await i2c1.i2cWrite(this.#address, buffer.length, buffer)
    await i2c1.close()
  }

  async getSolarVoltage() {
    const command = 0b01100001
    const i2c1 = await i2c.openPromisified(this.#bus)
    let response = await i2c1.readWord(this.#address, command)
    return this.convertResponse(response)
  }

  async getBatteryVoltage() { 
    const command = 0b01100011
    const i2c1 = await i2c.openPromisified(this.#bus)
    let response = await i2c1.readWord(this.#address, command)
    return this.convertResponse(response)
  }

  async getVoltages() {
    await this.setup()
    const batt  = await this.getBatteryVoltage()
    const solar = await this.getSolarVoltage()
    return {
      solar: solar,
      battery: batt
    }
  }
}

export default Max11645

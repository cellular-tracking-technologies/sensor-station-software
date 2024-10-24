/**
 * RTC DS3231 Interface
 */
import I2C from '../i2c/i2c.js'

const Address = 0x57
const Command = 0xf0
const Channel = 1

const i2c = new I2C({
  address: Address,
  bus: Channel,
})

export default async () => {
  const response_buffer = Buffer.alloc(8)
  const results = await i2c.readRegister({
    register: Command,
    buffer: response_buffer,
  })
  return response_buffer
}

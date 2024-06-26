import Addresses from './addresses.js'
import i2c from '../i2c/i2c.js'

const I2C = new i2c({
  address: 0x70,
  bus: 1
})

/**
 * Software Reset
 */
const Reset = async () => {
  console.log('issuing reset bytes to expander')
  return await I2C.writeRegister({
    register: Addresses.RegReset,
    buffer: Buffer.from([0x12, 0x34])
  })
}

const get_pin_mask = (pins) => {
  let a_mask = 0x00 // pins 0-7
  let b_mask = 0x00 // pins 8-15

  let relative_pin

  pins.forEach((pin) => {
    if (pin < 0 || pin > 15) {
      throw new Error('invalid pin - must be in the range 0-15')
    }

    if (pin < 8) {
      // A bank
      a_mask |= (1 << pin)
    } else {
      relative_pin = pin - 8
      b_mask |= (1 << relative_pin)
    }
  })
  return {
    a: a_mask,
    b: b_mask
  }
}

const PollState = async () => {
  let bufferA = Buffer.from([0x00])
  let bufferB = Buffer.from([0x00])

  let res_a = await I2C.readRegister({
    register: Addresses.RegDataA,
    buffer: bufferA
  })

  let res_b = await I2C.readRegister({
    register: Addresses.RegDataB,
    buffer: bufferB
  })
  return {
    a: res_a.buffer.readUInt8(),
    b: res_b.buffer.readUInt8(),
  }
}

/*
 * [ 0,1,3,6,14 ]
 *  
 */
const EnablePullUp = async (pins) => {
  console.log('enabling pullups for', pins)
  let mask = get_pin_mask(pins)

  // set the pull up state for bank A
  await I2C.writeRegister({
    register: Addresses.RegPullUpA,
    buffer: Buffer.from([mask.a])
  })

  // set the pull up state for bank B
  await I2C.writeRegister({
    register: Addresses.RegPullUpB,
    buffer: Buffer.from([mask.b])
  })
}

/**
 * set input / output for pins
 * [ 0,1,3,6,14 ]
 */
const SetDirection = async (pins) => {
  console.log('setting dirction for pins', pins)
  let mask = get_pin_mask(pins)

  // set the direction for pins on bank A
  await I2C.writeRegister({
    register: Addresses.RegDirA,
    buffer: Buffer.from([mask.a])
  })

  // set the direction for pins on bank B
  await I2C.writeRegister({
    register: Addresses.RegDirB,
    buffer: Buffer.from([mask.b])
  })
}

/**
 * opts.pins
 * opts.state - high / low
 */
const Drive = async (opts) => {
  const states = ['high', 'low']
  if (!states.includes(opts.state.toLowerCase())) {
    throw Error('invalid pin state - expected high/low')
  }
  let pin_mask = get_pin_mask(opts.pins)
  console.log('pin mask', pin_mask)
  let current_state = await PollState()
  if (opts.state.toLowerCase() == 'low') {
    // setting pin state to low
    pin_mask.a = current_state.a | pin_mask.a
    pin_mask.b = current_state.b | pin_mask.b
  } else {
    // setting pin state to high
    pin_mask.a = current_state.a & ~pin_mask.a
    pin_mask.b = current_state.b & ~pin_mask.b
  }

  console.log('updated mask A', pin_mask.a.toString(2))
  console.log('updated mask B', pin_mask.b.toString(2))

  let result
  result = await I2C.writeRegister({
    register: Addresses.RegDataA,
    buffer: Buffer.from([pin_mask.a])
  })
  console.log('bank a result', result)

  result = await I2C.writeRegister({
    register: Addresses.RegDataB,
    buffer: Buffer.from([pin_mask.b])
  })
  console.log('bank b result', result)
}

const print_bank = (info) => {
  console.log('bank a', parseInt(info.a).toString(2))
  console.log('bank b', parseInt(info.b).toString(2))
}

const Toggle = async (pins) => {
  let pin_mask = get_pin_mask(pins)
  let current_state = await PollState()

  // flip the bits for the desired state
  pin_mask.a ^= current_state.a
  pin_mask.b ^= current_state.b

  await I2C.writeRegister({
    register: Addresses.RegDataA,
    buffer: Buffer.from([pin_mask.a])
  })
  await I2C.writeRegister({
    register: Addresses.RegDataB,
    buffer: Buffer.from([pin_mask.b])
  })
}

const getMask = (opts) => {
  const mask = 1 << opts.pin
  switch (opts.state) {
    case 'high':
      opts.current |= mask
      break
    case 'low':
      opts.current &= ~mask
      break
    case 'toggle':
      opts.current ^= mask
      break
    default:
      throw new Error(`invalid state ${opts.state}`)
  }
  return opts.current
}

// set by each pin: high, low, toggle
const SetState = async (details) => {
  const current_state = await PollState()
  const mask_a = details
    .filter(detail => detail.pin < 8)
    .reduce((prev, detail) => {
      return getMask({
        pin: detail.pin,
        state: detail.state,
        current: prev,
      })
    }, current_state.a)

  const mask_b = details
    .filter(detail => detail.pin >= 8)
    .map(detail => {
      detail.pin = detail.pin - 8
      return detail
    })
    .reduce((prev, detail) => {
      return getMask({
        pin: detail.pin,
        state: detail.state,
        current: prev,
      })
    }, current_state.b)

  await I2C.writeRegister({
    register: Addresses.RegDataA,
    buffer: Buffer.from([mask_a])
  })
  await I2C.writeRegister({
    register: Addresses.RegDataB,
    buffer: Buffer.from([mask_b])
  })
}

export { Reset, EnablePullUp, SetDirection, PollState, Drive, Toggle, SetState }

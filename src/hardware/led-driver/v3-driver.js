import { Drive, Toggle } from '../io-expander/expander.js'
import kernel_pins from '../kernel/kernel.js'

const { v3: { GPS, A, B } } = kernel_pins
console.log('v3 driver pins', GPS, A, B)

const Pins = {
  GPS,
  A,
  B,
}

class Led {
  #addr
  #interval

  constructor(addr) {
    this.#addr = addr
    this.#interval = null
    console.log('construct led driver', addr)
  }

  async init() {
    console.log('init led - turn it off', this.#addr)
    this.off()
  }

  async on() {
    console.log('led on', this.#addr)
    clearInterval(this.#interval)
    await Drive({
      pins: [this.#addr],
      state: 'high'
    })
  }

  async off() {
    console.log('led off', this.#addr)
    clearInterval(this.#interval)
    await Drive({
      pins: [this.#addr],
      state: 'low'
    })

  }

  async toggle() {
    console.log('toggle led', this.#addr)
    clearInterval(this.#interval)
    await Toggle([this.#addr])
  }

  blink(period_ms) {
    console.log('blink led at', period_ms, this.#addr)
    clearInterval(this.#interval)
    this.#interval = setInterval(() => {
      Toggle([this.#addr])
    }, period_ms)
  }

}

class GpsLed extends Led {
  constructor() {
    super(Pins.GPS)
  }
}

class DiagALed extends Led {
  constructor() {
    super(Pins.A)
  }
}

class DiagBLed extends Led {
  constructor() {
    super(Pins.B)
  }
}

export { Led, GpsLed, DiagALed, DiagBLed }

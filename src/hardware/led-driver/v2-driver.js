import { Gpio } from 'onoff'
import kernel_pins from '../kernel/kernel.js'

const { v2: { GPS, A, B, } } = kernel_pins
const Pins = {
  GPS,
  A,
  B,
}

class Led {
  constructor(gpio) {
    this.led = new Gpio(gpio, 'out')
    this.blink_timer
  }
  init() {
    this.off()
  }
  on() {
    clearInterval(this.blink_timer)
    this.led.write(1).catch(error => {
      throw error
    })
  }
  off() {
    clearInterval(this.blink_timer)
    this.led.write(0).catch(error => {
      throw error
    })
  }
  toggle() {
    clearInterval(this.blink_timer)
    this.led.read()
      .then(value => this.led.write(value ^ 1))
      .catch(error => {
        throw error
      })
  }
  blink(period_ms) {
    if (typeof period_ms == 'number') {
      clearInterval(this.blink_timer)
      this.blink_timer = setInterval(() => {
        this.led.read()
          .then(value => this.led.write(value ^ 1))
          .catch(error => {
            throw error
          })
      }, Math.round(period_ms))
    } else {
      throw new TypeError(`period_ms [${typeof period_ms}] must be a number!`)
    }
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

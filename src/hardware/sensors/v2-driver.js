import EventEmitter from 'events'
import Adc from './adc.js'
import Tmp102 from './tmp102.js'

const ADC_TYPE = 'Ads7924'

/**
 * abstraction for v2 sensor monitoring
 */
class SensorMonitor extends EventEmitter {
  constructor() {
    super()
    this.adc = new Adc({ type: ADC_TYPE })
    this.temp = new Tmp102()
    this.interval
    this.data = {
      voltages: {},
      temperature: {}
    }
  }

  init() {
    this.adc.init()
    this.temp.init()
  }

  start(interval) {
    this.init()
    this.interval = setInterval(this.read.bind(this), interval)
  }

  stop() {
    clearInterval(this.interval)
    this.interval = null
  }

  convertVoltage(value) {
    return value * (5.016 / 4096) * 6
  }

  convertCelsius(value) {
    return value * 1.8 + 32
  } 

  read() {
    const celsius = this.temp.read()
    this.data = {
      voltages: {
        battery: this.convertVoltage(this.adc.read(0)).toFixed(2),
        solar: this.convertVoltage(this.adc.read(1)).toFixed(2),
        rtc: this.convertVoltage(this.adc.read(2)).toFixed(2),
      },
      temperature: {
        celsius: celsius.toFixed(0),
        fahrenheit: this.convertCelsius(celsius).toFixed(0)
      },
      recorded_at: new Date()
    }
    this.emit('sensor', this.data)
  }
}

export default SensorMonitor

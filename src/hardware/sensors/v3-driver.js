import EventEmitter from 'events'
import Max11645 from './max11645.js'
import Tmp411 from './temperature/tmp411.js'

/**
 * abstraction for v3 station sensor monitor
 */
class SensorMonitor extends EventEmitter {
  constructor() {
    super()
    this.adc = new Max11645()
    this.temperature_sensor = new Tmp411()
    this.interval = null
    this.data = {
      voltages: {},
      temperature: {},
    }
  }

  start(interval) {
    this.interval = setInterval(this.read.bind(this), interval)
  }

  stop() {
    clearInterval(this.interval)
    this.interval = null
  }

  async read() {
    let voltages = await this.adc.getVoltages()
    const temperature = await this.temperature_sensor.readLocalTemperature()
    const { celsius, fahrenheit } = temperature
    this.data = {
      voltages: {
        battery: voltages.battery.toFixed(2),
        solar: voltages.solar.toFixed(2),
        rtc: -1
      },
      temperature: {
        celsius,
        fahrenheit,
      },
      recorded_at: new Date()
    }
    this.emit('sensor', this.data)
  }
}

export default SensorMonitor

import EventEmitter from 'events'
import Max11645 from './max11645.js'

class SensorMonitor extends EventEmitter {
  constructor() {
    super()
    this.adc = new Max11645()
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
    this.data = {
      voltages: {
        battery: voltages.battery.toFixed(2),
        solar: voltages.solar.toFixed(2),
        rtc: -1
      },
      temperature: {
        celsius: 0,
        fahrenheit: 0,
      },
      recorded_at: new Date()
    }
    this.emit('sensor', this.data)
  }
}

export default SensorMonitor

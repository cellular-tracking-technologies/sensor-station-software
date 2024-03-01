import { WifiStrength } from './tasks/wifi-strength.js'
import { CellularIds, CellularCarrier } from "./tasks/cellular-task.js"
import { GpsTask } from "./tasks/gps-task.js"
import { SensorTemperatureTask } from "./tasks/sensor-temp-task.js"
import { SensorVoltageTask } from "./tasks/sensor-voltage-task.js"
import display from './display-driver.js'

/**
 * 
 */
class StandBy {
  /**
   * 
   */
  constructor(host) {
    this.wifi = new WifiStrength(host)
    // this.battery = new Battery()
    // this.solar = new SensorVoltageTask()
    // this.temperature = new SensorTemperatureTask()
    // this.location = new Location()
    // this.cellular = new CellularCarrier()
    // this.gps = new GpsTask()
  }

  clearScreen() {
    display.clear()
  }

  percent() {
    return ['Wifi', this.wifi.results()]
    // display.write(percent)
  }

}

export { StandBy }
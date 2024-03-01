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
    this.power = new SensorVoltageTask(host)
    // this.temperature = new SensorTemperatureTask()
    // this.location = new Location()
    this.cellular = new CellularCarrier(host)
    // this.gps = new GpsTask()
  }

  // async createChar(bars) {
  //   let arrByte = Uint8Array.from(bars)
  //   this.display.lcd.createChar(0, arrByte)
  //   this.display.lcd.setCursor(0, 0)
  //   this.display.lcd.print(`wifi: ${`\x00`}`)
  // }

  clearScreen() {
    display.clear()
  }

  async results() {
    let wifi_results = await this.wifi.results()
    console.log('wifi', await this.wifi.results())
    display.lcd.setCursor(0, 0)
    display.lcd.print(`wifi: ${wifi_results}`)

    let cell_results = await this.cellular.results()
    console.log('cellular', await this.cellular.results())
    display.lcd.setCursor(0, 1)
    display.lcd.print(`cell: ${cell_results[2]}`)

    let battery_results = await this.power.results()
    console.log('battery results', battery_results)
    display.lcd.setCursor(0, 2)
    display.lcd.print(`${battery_results[1]}`)

    display.lcd.setCursor(0, 3)
    display.lcd.print(`${battery_results[3]}`)

    // return ['Wifi', this.wifi.results()]
    // display.write(percent)
  }

}

export { StandBy }
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
    this.batt
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

  async getBattVoltage() {
    let battery_results = await this.power.results()
    console.log('battery results', battery_results)
    let volt = Number(battery_results[1].match(/(\d.+)/g))
    await this.createBattChar(volt)
  }

  async createBattChar(voltage) {
    let bar0, bar1, bar2, top, arrByte
    if (voltage > 11) {

      bar0 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      arrByte = Uint8Array.from(bar0)
      display.lcd.createChar(1, arrByte)
      display.lcd.setCursor(2, 2)
      display.lcd.print(`\x01`)

      bar1 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      arrByte = Uint8Array.from(bar1)
      display.lcd.createChar(2, arrByte)
      display.lcd.setCursor(3, 2)
      display.lcd.print(`\x02`)

      bar2 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      arrByte = Uint8Array.from(bar2)
      display.lcd.createChar(3, arrByte)
      display.lcd.setCursor(4, 2)
      display.lcd.print(`\x03`)

      top = Buffer.from([0x00, 0x00, 0x18, 0x18, 0x18, 0x18, 0x00, 0x00], 'hex')
      arrByte = Uint8Array.from(top)
      display.lcd.createChar(4, arrByte)
      display.lcd.setCursor(5, 2)
      display.lcd.print(`\x04`)
      // char = await this.createChar(bars)
      // console.log('char high strength', char)


      // } else if (percent <= 11 && percent > 10) {
      //   bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x02, 0x06, 0x0e, 0x1e], 'hex')
      //   await this.createChar(bars)
      //   console.log('med strength', rows)

      // } else if (voltage <= 10) {
      //   bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x02, 0x04, 0x0c, 0x1c], 'hex')
      //   await this.createChar(bars)
      //   console.log('low strength', rows)
    }
  }

  async results() {
    let wifi_results = await this.wifi.results()
    console.log('wifi', await this.wifi.results())
    display.lcd.setCursor(0, 0)
    display.lcd.print(`wifi: ${wifi_results}`)

    let cell_results = await this.cellular.results()
    console.log('cellular', await this.cellular.results())
    display.lcd.setCursor(0, 1) //column row
    display.lcd.print(`cell: ${cell_results[2]}`)

    await this.getBattVoltage()

    // let battery_results = await this.power.results()
    // console.log('battery results', battery_results)

    // display.lcd.setCursor(0, 2)
    // display.lcd.print(`${battery_results[1]}`)

    // display.lcd.setCursor(0, 3)
    // display.lcd.print(`${battery_results[3]}`)

    // return ['Wifi', this.wifi.results()]
    // display.write(percent)
  }

}

export { StandBy }
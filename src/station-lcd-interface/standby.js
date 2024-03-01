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
    this.cellular_id = new CellularIds(host)
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
    console.log('voltage', voltage)
    let bar0, bar1, bar2, top, arrByte
    if (voltage > 11.65) {

      bar0 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      arrByte = Uint8Array.from(bar0)
      display.lcd.createChar(1, arrByte)
      display.lcd.setCursor(0, 2)
      display.lcd.print(`\x01`)

      bar1 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      arrByte = Uint8Array.from(bar1)
      display.lcd.createChar(2, arrByte)
      display.lcd.setCursor(1, 2)
      display.lcd.print(`\x02`)

      bar2 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      arrByte = Uint8Array.from(bar2)
      display.lcd.createChar(3, arrByte)
      display.lcd.setCursor(2, 2)
      display.lcd.print(`\x03`)

      top = Buffer.from([0x00, 0x00, 0x18, 0x18, 0x18, 0x18, 0x00, 0x00], 'hex')
      arrByte = Uint8Array.from(top)
      display.lcd.createChar(4, arrByte)
      display.lcd.setCursor(3, 2)
      display.lcd.print(`\x04`)
      // char = await this.createChar(bars)
      // console.log('char high strength', char)


    } else if (voltage <= 11.65 && voltage > 10) {
      bar0 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      arrByte = Uint8Array.from(bar0)
      display.lcd.createChar(1, arrByte)
      display.lcd.setCursor(0, 2)
      display.lcd.print(`\x01`)

      bar1 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      arrByte = Uint8Array.from(bar1)
      display.lcd.createChar(2, arrByte)
      display.lcd.setCursor(1, 2)
      display.lcd.print(`\x02`)

      bar2 = Buffer.from([0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f], 'hex')
      arrByte = Uint8Array.from(bar2)
      display.lcd.createChar(3, arrByte)
      display.lcd.setCursor(2, 2)
      display.lcd.print(`\x03`)

      top = Buffer.from([0x00, 0x00, 0x18, 0x18, 0x18, 0x18, 0x00, 0x00], 'hex')
      arrByte = Uint8Array.from(top)
      display.lcd.createChar(4, arrByte)
      display.lcd.setCursor(3, 2)
      display.lcd.print(`\x04`)

      // } else if (voltage <= 10) {
      //   bars = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x02, 0x04, 0x0c, 0x1c], 'hex')
      //   await this.createChar(bars)
      //   console.log('low strength', rows)
    }
  }

  async createWifiChar(percent) {
    let block_left, block_center, block_right, arrByte

    if (percent > 85) {

      block_left = Buffer.from([0x00, 0x03, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00], 'hex')
      arrByte = Uint8Array.from(block_left)
      display.lcd.createChar(5, arrByte)
      display.lcd.setCursor(0, 0)
      display.lcd.print(`\x05`)

      block_center = Buffer.from([0x1f, 0x00, 0x00, 0x1f, 0x00, 0x0e, 0x11, 0x04], 'hex')
      arrByte = Uint8Array.from(block_center)
      display.lcd.createChar(6, arrByte)
      display.lcd.setCursor(1, 0)
      display.lcd.print(`\x06`)

      block_right = Buffer.from([0x00, 0x18, 0x04, 0x00, 0x10, 0x00, 0x00, 0x00], 'hex')
      arrByte = Uint8Array.from(block_right)
      display.lcd.createChar(7, arrByte)
      display.lcd.setCursor(2, 0)
      display.lcd.print(`\x07`)

    } else if (percent <= 85 && percent > 50) {

      block_left = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00], 'hex')
      arrByte = Uint8Array.from(block_left)
      display.lcd.createChar(5, arrByte)
      display.lcd.setCursor(0, 0)
      display.lcd.print(`\x05`)

      block_center = Buffer.from([0x00, 0x00, 0x00, 0x1f, 0x00, 0x0e, 0x11, 0x04], 'hex')
      arrByte = Uint8Array.from(block_center)
      display.lcd.createChar(6, arrByte)
      display.lcd.setCursor(1, 0)
      display.lcd.print(`\x06`)

      block_right = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00], 'hex')
      arrByte = Uint8Array.from(block_right)
      display.lcd.createChar(7, arrByte)
      display.lcd.setCursor(2, 0)
      display.lcd.print(`\x07`)
    }
  }

  async results() {
    let wifi_results = await this.wifi.results()
    console.log('wifi results', wifi_results)
    await this.createWifiChar(wifi_results)
    // let wifi_results = await this.wifi.results()
    // display.lcd.setCursor(0, 0)
    // display.lcd.print(`wifi: ${wifi_results}`)

    // let cell_results = await this.cellular.results()
    // console.log('cellular', await this.cellular.results())
    // display.lcd.setCursor(0, 1) //column row
    // display.lcd.print(`cell: ${cell_results[2]}`)

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
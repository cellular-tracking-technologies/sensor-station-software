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
    this.temp = new SensorTemperatureTask(host)
    // this.location = new Location()
    this.cellular = new CellularCarrier(host)
    // this.cellular_id = new CellularIds(host)
    this.gps = new GpsTask(host)
  }

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

      display.lcd.setCursor(0, 2)
      display.lcd.print(`\xff`)

      display.lcd.setCursor(1, 2)
      display.lcd.print(`\xff`)

      display.lcd.setCursor(2, 2)
      display.lcd.print(`\xff`)

      top = Buffer.from([0x00, 0x00, 0x18, 0x18, 0x18, 0x18, 0x00, 0x00], 'hex')
      arrByte = Uint8Array.from(top)
      display.lcd.createChar(4, arrByte)
      display.lcd.setCursor(3, 2)
      display.lcd.print(`\x04`)

    } else if (voltage <= 11.65 && voltage > 10) {
      // bar0 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      // arrByte = Uint8Array.from(bar0)
      // display.lcd.createChar(1, arrByte)
      // display.lcd.setCursor(0, 2)
      // display.lcd.print(`\x01`)

      // bar1 = Buffer.from([0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f], 'hex')
      // arrByte = Uint8Array.from(bar1)
      // display.lcd.createChar(2, arrByte)
      // display.lcd.setCursor(1, 2)
      // display.lcd.print(`\x02`)
      display.lcd.setCursor(0, 2)
      display.lcd.print(`\xff`)

      display.lcd.setCursor(1, 2)
      display.lcd.print(`\xff`)

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

  async createCellChar(rssi) {
    let block_left, block_right, arrByte0, arrByte1
    if (rssi > -113) {
      display.lcd.setCursor(5, 0)
      display.lcd.print('\x28')

      display.lcd.setCursor(6, 0)
      display.lcd.print(`\x28`)

      display.lcd.setCursor(7, 0)
      display.lcd.print('\x2a')

      display.lcd.setCursor(8, 0)
      display.lcd.print('\x29')

      display.lcd.setCursor(9, 0)
      display.lcd.print('\x29')

      display.lcd.setCursor(7, 1)
      display.lcd.print('\x7c')

    } else if (rssi <= -113) {
      display.lcd.setCursor(6, 0)
      display.lcd.print(`\x28`)

      display.lcd.setCursor(7, 0)
      display.lcd.print('\x2a')

      display.lcd.setCursor(8, 0)
      display.lcd.print('\x29')

      display.lcd.setCursor(7, 1)
      display.lcd.print('\x7c')
    } else {
      display.lcd.setCursor(7, 0)
      display.lcd.print('\x21')
    }
  }

  async results() {
    let wifi_results = await this.wifi.results()
    console.log('wifi results', wifi_results)
    await this.createWifiChar(wifi_results)

    await this.getBattVoltage()

    let cell_results = await this.cellular.results()
    console.log('cell regex', cell_results[2].match(/(-)\w+/g))
    let rssi = cell_results[2].match(/(-)\w+/g) ? Number(cell_results[2].match(/(-)\w+/g)) : undefined
    console.log('cell results rssi', cell_results[2], rssi)
    await this.createCellChar(rssi)
    console.log('cellular', await this.cellular.results())

    let temp_results = await this.temp.results()
    console.log('temp results', temp_results)

    let regex_temp = temp_results[1].match(/(-\d)\w+/g)
    console.log('temp results regex', temp_results, regex_temp)

    display.lcd.setCursor(12, 0)
    display.lcd.print(`${regex_temp[0]}`)

    display.lcd.setCursor(12, 1)
    display.lcd.print(`${regex_temp[1]}`)

  }

}

export { StandBy }
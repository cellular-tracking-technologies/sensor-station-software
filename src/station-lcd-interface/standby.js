import { WifiStrength } from './tasks/wifi-strength.js'
import { CellularCarrier } from "./tasks/cellular-task.js"
import { SensorTemperatureTask } from "./tasks/sensor-temp-task.js"
import { SensorVoltageTask } from "./tasks/sensor-voltage-task.js"
import display from './display-driver.js'
import { wifi, battery } from './lcd-chars.js'

/**
 * 
 */
class StandBy {
  /**
   * @param {String} host ip address of server
   */
  constructor(host) {
    this.wifi = new WifiStrength(host)
    this.power = new SensorVoltageTask(host)
    this.temp = new SensorTemperatureTask(host)
    this.cellular = new CellularCarrier(host)
  }

  clearScreen() {
    display.clear()
  }

  async getWifiStrength() {
    let wifi_results = await this.wifi.results()
    await this.createWifiChar(wifi_results)
  }

  async createWifiChar(percent) {
    let block_left, block_center, block_right, arrByte

    if (percent > 85) {

      display.lcd.createChar(wifi.block_left.char, wifi.block_left.byte.high)
      display.lcd.setCursor(0, 0)
      display.lcd.print(wifi.block_left.hex)

      display.lcd.createChar(wifi.block_center.char, wifi.block_center.byte.high)
      display.lcd.setCursor(1, 0)
      display.lcd.print(wifi.block_center.hex)

      display.lcd.createChar(wifi.block_right.char, wifi.block_right.byte.high)
      display.lcd.setCursor(2, 0)
      display.lcd.print(wifi.block_right.hex)

    } else if (percent <= 85 && percent > 50) {

      display.lcd.createChar(wifi.block_left.char, wifi.block_left.byte.med)
      display.lcd.setCursor(0, 0)
      display.lcd.print(wifi.block_left.hex)

      display.lcd.createChar(wifi.block_center.char, wifi.block_center.byte.med)
      display.lcd.setCursor(1, 0)
      display.lcd.print(wifi.block_center.hex)

      display.lcd.createChar(wifi.block_right.char, wifi.block_right.byte.med)
      display.lcd.setCursor(2, 0)
      display.lcd.print(wifi.block_right.hex)
    }
  }

  async getBattVoltage() {
    let battery_results = await this.power.results()
    console.log('battery results', battery_results)
    let volt = Number(battery_results[1].match(/(\d.+)/g))
    await this.createBattChar(volt)
  }

  async createBattChar(voltage) {
    console.log('voltage', voltage)
    // let bar0, bar1, bar2, top, arrByte
    // top = Uint8Array.from(Buffer.from([0x00, 0x00, 0x18, 0x18, 0x18, 0x18, 0x00, 0x00], 'hex'))
    // let empty_bar = Uint8Array.from(Buffer.from([0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f], 'hex'))
    // let full_bar = `\xff`

    display.lcd.createChar(battery.top.char, battery.top.byte)
    display.lcd.createChar(battery.empty_bar.char, battery.empty_bar.byte)
    // display.lcd.createChar(3, full_bar)

    // print top part of battery
    display.lcd.setCursor(3, 2)
    display.lcd.print(battery.top.hex)

    if (voltage > 11.5) {

      // print bar0
      display.lcd.setCursor(0, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(1, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar2
      display.lcd.setCursor(2, 2)
      display.lcd.print(battery.full_bar.hex)

    } else if (voltage <= 11.75 && voltage > 10) {

      // print bar0
      display.lcd.setCursor(0, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(1, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar2
      display.lcd.setCursor(2, 2)
      display.lcd.print(battery.empty_bar.hex)


    } else if (voltage <= 10) {

      // print bar0
      display.lcd.setCursor(0, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(1, 2)
      display.lcd.print(battery.empty_bar.hex)

      // print bar2
      display.lcd.setCursor(2, 2)
      display.lcd.print(battery.empty_bar.hex)
    }

  }

  async getCellStrength() {
    let cell_results = await this.cellular.results()
    let rssi = cell_results[2].match(/(-)\w+/g) ? Number(cell_results[2].match(/(-)\w+/g)) : undefined
    await this.createCellChar(rssi)
  }

  async createCellChar(rssi) {
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

  async getTempValues() {
    let temp_results = await this.temp.results()

    let regex_temp = temp_results[1].match(/-?\d+/g)

    display.lcd.setCursor(12, 0)
    display.lcd.print(`${regex_temp[0]}${`\xdf`}C`)

    display.lcd.setCursor(12, 1)
    display.lcd.print(`${regex_temp[1]}${`\xdf`}F`)
  }

  async results() {

    await this.getWifiStrength()
    await this.getBattVoltage()
    await this.getCellStrength()
    await this.getTempValues()
  }

}

export { StandBy }
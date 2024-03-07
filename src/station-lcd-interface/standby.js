import { WifiStrength } from './tasks/wifi-strength.js'
import { CellularCarrier } from "./tasks/cellular-task.js"
import { SensorTemperatureTask } from "./tasks/sensor-temp-task.js"
import { SensorVoltageTask } from "./tasks/sensor-voltage-task.js"
import display from './display-driver.js'
import { wifi, battery, cell, temp, solar } from './lcd-chars.js'
import fetch from 'node-fetch'
import url from 'url'
/**
 * 
 */
class StandBy {
  /**
   * @param {String} host ip address of server
   */
  constructor(base_url, refresh = 5000) {
    this.volt_url = url.resolve(base_url, 'sensor/voltages')
    this.temp_url = url.resolve(base_url, 'sensor/temperature')
    this.wifi_url = url.resolve(base_url, 'internet/wifi-strength')
    this.cell_url = url.resolve(base_url, 'modem')

    this.autoRefresh = refresh
  }
  loading() {
    // return [this.header, "Loading..."]
    return []
  }
  async results() {
    try {

      let [voltages, temperature, wifi_res, cell_res] = await Promise.all([
        fetch(this.volt_url),
        fetch(this.temp_url),
        fetch(this.wifi_url),
        fetch(this.cell_url),
      ]).then(([voltages, temperature, wifi, cell]) => {
        return [
          voltages.json(),
          temperature.json(),
          wifi.json(),
          cell.json()
        ]
      })

      console.log('standby data', await voltages, await temperature, await wifi_res, await cell_res)
      await this.getSolarVoltage(await voltages)

      await this.getWifiStrength(await wifi_res)
      await this.getBattVoltage(await voltages)
      await this.getCellStrength(await cell_res)
      await this.getTempValues(await temperature)
    } catch (err) {
      console.error(err)
    }
  }

  clearScreen() {
    display.clear()
  }

  async getWifiStrength(wifi_res) {
    let { wifi_strength: percent } = wifi_res
    await this.createWifiChar(Number(percent))

  }

  async createWifiChar(percent) {

    if (percent > 97) {

      display.lcd.createChar(wifi.block_left.char, wifi.block_left.byte.high)
      display.lcd.setCursor(0, 0)
      display.lcd.print(wifi.block_left.hex)

      display.lcd.createChar(wifi.block_center.char, wifi.block_center.byte.high)
      display.lcd.setCursor(1, 0)
      display.lcd.print(wifi.block_center.hex)

      display.lcd.createChar(wifi.block_right.char, wifi.block_right.byte.high)
      display.lcd.setCursor(2, 0)
      display.lcd.print(wifi.block_right.hex)

    } else if (percent <= 97 && percent > 50) {

      display.lcd.createChar(wifi.block_left.char, wifi.block_left.byte.med)
      display.lcd.setCursor(0, 0)
      display.lcd.print(wifi.block_left.hex)

      display.lcd.createChar(wifi.block_center.char, wifi.block_center.byte.med)
      display.lcd.setCursor(1, 0)
      display.lcd.print(wifi.block_center.hex)

      display.lcd.createChar(wifi.block_right.char, wifi.block_right.byte.med)
      display.lcd.setCursor(2, 0)
      display.lcd.print(wifi.block_right.hex)
    } else {
      display.lcd.setCursor(1, 0)
      display.lcd.print(wifi.warning.hex)
    }
  }

  async getBattVoltage(voltage) {
    await this.createBattChar(Number(voltage.battery))
    // let battery_results = await this.power.results()
    // console.log('battery results', battery_results)
    // let volt = Number(battery_results[1].match(/(\d.+)/g))
    // await this.createBattChar(volt)
  }

  async createBattChar(voltage) {
    console.log('voltage', voltage)

    // create top part of battery icon
    display.lcd.createChar(battery.top.char, battery.top.byte)

    // create empty bar of battery icon
    display.lcd.createChar(battery.empty_bar.char, battery.empty_bar.byte)

    // print top part of battery
    display.lcd.setCursor(3, 2)
    display.lcd.print(battery.top.hex)

    if (voltage > 11.75) {

      // print bar0
      display.lcd.setCursor(0, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(1, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar2
      display.lcd.setCursor(2, 2)
      display.lcd.print(battery.full_bar.hex)

    } else if (voltage <= 11.75 && voltage > 11.3) {

      // print bar0
      display.lcd.setCursor(0, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(1, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar2
      display.lcd.setCursor(2, 2)
      display.lcd.print(battery.empty_bar.hex)


    } else if (voltage <= 11.3) {

      // print bar0
      display.lcd.setCursor(0, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(1, 2)
      display.lcd.print(battery.empty_bar.hex)

      // print bar2
      display.lcd.setCursor(2, 2)
      display.lcd.print(battery.empty_bar.hex)
    } else {
      display.lcd.setCursor(1, 2)
      display.lcd.print(battery.warning.hex)
    }

  }

  async getCellStrength(cell) {
    let { signal } = cell
    // let cell_results = await this.cellular.results()
    console.log('cell signal', signal.match(/(-)\w+/g))
    let rssi = signal.match(/(-)\w+/g) ? Number(signal.match(/(-)\w+/g)) : undefined
    await this.createCellChar(rssi)
  }

  async createCellChar(rssi) {
    console.log('create cell char rssi', rssi)
    if (rssi > -90) {
      display.lcd.setCursor(5, 0)
      display.lcd.print(cell.left.hex)

      display.lcd.setCursor(6, 0)
      display.lcd.print(cell.left.hex)

      display.lcd.setCursor(7, 0)
      display.lcd.print(cell.center.hex)

      display.lcd.setCursor(8, 0)
      display.lcd.print(cell.right.hex)

      display.lcd.setCursor(9, 0)
      display.lcd.print(cell.right.hex)

      display.lcd.setCursor(7, 1)
      display.lcd.print(cell.bottom.hex)

    } else if (rssi <= -90 && rssi > -105) {
      display.lcd.setCursor(6, 0)
      display.lcd.print(cell.left.hex)

      display.lcd.setCursor(7, 0)
      display.lcd.print(cell.center.hex)

      display.lcd.setCursor(8, 0)
      display.lcd.print(cell.right.hex)

      display.lcd.setCursor(7, 1)
      display.lcd.print(cell.bottom.hex)
    } else if (rssi <= -105) {
      display.lcd.setCursor(7, 0)
      display.lcd.print(cell.center.hex)

      display.lcd.setCursor(7, 1)
      display.lcd.print(cell.bottom.hex)
    } else {
      display.lcd.setCursor(7, 0)
      display.lcd.print(cell.warning.hex)
    }
  }

  async getTempValues(temperature) {
    let { celsius, fahrenheit } = temperature
    console.log(celsius, 'C', fahrenheit, 'F')

    if (!celsius) {
      display.lcd.setCursor(12, 0)
      display.lcd.print(`${temp.warning.hex}${temp.degree.hex}C`)

      display.lcd.setCursor(12, 1)
      display.lcd.print(`${temp.warning.hex}${temp.degree.hex}F`)
    } else {

      display.lcd.setCursor(12, 0)
      display.lcd.print(`${celsius.toString()}${temp.degree.hex}C`)

      display.lcd.setCursor(12, 1)
      display.lcd.print(`${fahrenheit}${temp.degree.hex}F`)
    }

  }

  async getSolarVoltage(voltage) {
    await this.createSolarChar(Number(voltage.solar))
  }

  async createSolarChar(voltage) {
    console.log('solar voltage', voltage)

    if (voltage > 0.03) {

      display.lcd.createChar(solar.block_left.char, solar.block_left.byte.high)
      display.lcd.setCursor(10, 2)
      display.lcd.print(solar.block_left.hex)

      display.lcd.createChar(solar.block_right.char, solar.block_right.byte.high)
      display.lcd.setCursor(11, 2)
      display.lcd.print(solar.block_right.hex)


    } else if (voltage <= 0.03 && voltage > 0.02) {

      display.lcd.createChar(solar.block_left.char, solar.block_left.byte.med)
      display.lcd.setCursor(10, 2)
      display.lcd.print(solar.block_left.hex)

      display.lcd.createChar(solar.block_right.char, solar.block_right.byte.med)
      display.lcd.setCursor(11, 2)
      display.lcd.print(solar.block_right.hex)


    } else if (voltage <= 0.02) {

      display.lcd.createChar(solar.block_left.char, solar.block_left.byte.low)
      display.lcd.setCursor(10, 2)
      display.lcd.print(solar.block_left.hex)

      display.lcd.createChar(solar.block_right.char, solar.block_right.byte.low)
      display.lcd.setCursor(11, 2)
      display.lcd.print(solar.block_right.hex)
    } else {
      display.lcd.setCursor(10, 2)
      display.lcd.print(battery.warning.hex)
    }
  }
}

export { StandBy }
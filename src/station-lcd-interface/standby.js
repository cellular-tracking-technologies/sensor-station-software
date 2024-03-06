import { WifiStrength } from './tasks/wifi-strength.js'
import { CellularCarrier } from "./tasks/cellular-task.js"
import { SensorTemperatureTask } from "./tasks/sensor-temp-task.js"
import { SensorVoltageTask } from "./tasks/sensor-voltage-task.js"
import display from './display-driver.js'
import { wifi, battery, cell, temp } from './lcd-chars.js'
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
      // }).then(async values => {

      console.log('standby data', await voltages, await temperature, await wifi_res, await cell_res)
      // resolve([this.header, `${res.wifi_strength}`, `${res.temperature}`, `${res.voltages}`])

      // resolve([this.header, `Temp:${res.celsius}C [${res.fahrenheit}F]`])
      await this.getWifiStrength(await wifi_res)
      await this.getBattVoltage(await voltages)
      await this.getCellStrength(await cell_res)
      await this.getTempValues(await temperature)
    } catch (err) {
      console.error(err)
    }
    // })
    // .catch(error => {
    //   resolve([this.header, `error`])
    // })
  }

  clearScreen() {
    display.clear()
  }

  async getWifiStrength(wifi_res) {
    let { wifi_strength: percent } = wifi_res
    console.log('get wifi strength percent', percent)
    await this.createWifiChar(Number(percent))

    // let wifi_results = await this.wifi.results()
    // console.log('wifi signal', wifi_results)
    // await this.createWifiChar(wifi_results)
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

    if (voltage > 11.67) {

      // print bar0
      display.lcd.setCursor(0, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(1, 2)
      display.lcd.print(battery.full_bar.hex)

      // print bar2
      display.lcd.setCursor(2, 2)
      display.lcd.print(battery.full_bar.hex)

    } else if (voltage <= 11.67 && voltage > 10) {

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
    if (rssi > -113) {
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

    } else if (rssi <= -113) {
      display.lcd.setCursor(6, 0)
      display.lcd.print(cell.left.hex)

      display.lcd.setCursor(7, 0)
      display.lcd.print(cell.center.hex)

      display.lcd.setCursor(8, 0)
      display.lcd.print(cell.right.hex)

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
    // let temp_results = await this.temp.results()

    // let regex_temp = temp_results[1].match(/-?\d+/g)

    // let regex_temp = temperature

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
}

export { StandBy }
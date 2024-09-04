import fetch from 'node-fetch'
import url from 'url'

import Network from '../hardware/pi/network/index.js'
import display from './display-driver.js'
import { wifi, battery, cell, temp, solar, thresholds } from './lcd-chars.js'
/**
 * 
 */
class StationStats {
  /**
   * @param {String} host ip address of server
   */
  constructor(base_url, refresh = 10000) {
    this.volt_url = url.resolve(base_url, 'sensor/voltages')
    this.temp_url = url.resolve(base_url, 'sensor/temperature')
    this.autoRefresh = refresh
  }
  loading() {
    // return [this.header, "Loading..."]
    return []
  }
  async results() {
    try {
      const [voltages, temperature,] = await Promise.all([
        fetch(this.volt_url),
        fetch(this.temp_url),
      ]).then(([voltages, temperature,]) => {
        return [
          voltages.json(),
          temperature.json(),
        ]
      })
      // await this.getSolarVoltage(await voltages)
      await this.getBattVoltage(await voltages)
      await this.getTempValues(await temperature)

      const network = Network.Wifi.GetCurrentNetwork()
      const modem = Network.Modem.info()

      const wifi_signal = network && network.connected == true ? network.signal : undefined
      const modem_signal = modem && modem.state == 'connected' ? modem.signal : undefined

      await this.createWifiChar(wifi_signal)
      await this.createCellChar(modem_signal)
    } catch (err) {
      console.error('lcd client error', err)
    }
  }

  clearScreen() {
    display.clear()
  }


  async createWifiChar(percent) {
    if (percent > thresholds.wifi.max) {

      display.lcd.createChar(wifi.block_left.char, wifi.block_left.byte.high)
      display.lcd.setCursor(0, 0)
      display.lcd.print(wifi.block_left.hex)

      display.lcd.createChar(wifi.block_right.char, wifi.block_right.byte.high)
      display.lcd.setCursor(1, 0)
      display.lcd.print(wifi.block_right.hex)

    } else if (percent <= thresholds.wifi.max && percent > thresholds.wifi.med) {

      display.lcd.createChar(wifi.block_left.char, wifi.block_left.byte.med)
      display.lcd.setCursor(0, 0)
      display.lcd.print(wifi.block_left.hex)

      display.lcd.createChar(wifi.block_right.char, wifi.block_right.byte.med)
      display.lcd.setCursor(1, 0)
      display.lcd.print(wifi.block_right.hex)

    } else {
      display.lcd.setCursor(1, 0)
      display.lcd.print(wifi.warning.hex)
    }
  }


  async createCellChar(rssi) {

    if (rssi > thresholds.cell.max) {
      display.lcd.createChar(cell.block_left.char, cell.block_left.byte.low)
      display.lcd.setCursor(3, 0)
      display.lcd.print(cell.block_left.hex)

      display.lcd.createChar(cell.block_right.char, cell.block_right.byte.high)
      display.lcd.setCursor(4, 0)
      display.lcd.print(cell.block_right.hex)

    } else if (rssi <= thresholds.cell.max && rssi > thresholds.cell.med) {
      display.lcd.createChar(cell.block_left.char, cell.block_left.byte.low)
      display.lcd.setCursor(3, 0)
      display.lcd.print(cell.block_left.hex)

      display.lcd.createChar(cell.block_right.char, cell.block_right.byte.med)
      display.lcd.setCursor(4, 0)
      display.lcd.print(cell.block_right.hex)

    } else if (rssi <= thresholds.cell.med) {

      display.lcd.createChar(cell.block_left.char, cell.block_left.byte.low)
      display.lcd.setCursor(3, 0)
      display.lcd.print(cell.block_left.hex)

    } else {
      display.lcd.setCursor(3, 0)
      display.lcd.print(cell.warning.hex)
    }
  }

  async getBattVoltage(voltage) {
    const battery_round = Math.floor(voltage.battery * 10) / 10
    const solar_round = Math.floor(voltage.solar * 10) / 10
    try {

      display.lcd.createChar(battery.power.char, battery.power.byte)
      display.lcd.setCursor(6, 0) // column, then row
      display.lcd.print(`${battery.power.hex}:${battery_round}V`)

      display.lcd.createChar(solar.sun.char, solar.sun.byte)
      display.lcd.setCursor(6, 1)
      display.lcd.print(`${solar.sun.hex}:${solar_round}V`)
      // await this.createBattChar(Number(voltage.battery))
    } catch (e) {
      console.error('lcd voltage error', e)
      // await this.createBattChar(null)
    }
  }

  async getTempValues(temperature) {
    try {
      let { celsius, fahrenheit } = temperature

      celsius = Math.floor(celsius * 10) / 10
      fahrenheit = Math.floor(fahrenheit * 10) / 10

      if (!celsius) {
        display.lcd.setCursor(14, 0)
        display.lcd.print(`${temp.warning.hex}${temp.degree.hex}C`)

        display.lcd.setCursor(14, 1)
        display.lcd.print(`${temp.warning.hex}${temp.degree.hex}F`)
      } else if (celsius == -100) {


      } else {

        display.lcd.setCursor(14, 0)
        display.lcd.print(`${celsius.toString()}${temp.degree.hex}C`)

        display.lcd.setCursor(14, 1)
        display.lcd.print(`${fahrenheit}${temp.degree.hex}F`)
      }
    } catch (e) {
      console.error('lcd temp error', e)
    }
  }
}

export { StationStats }
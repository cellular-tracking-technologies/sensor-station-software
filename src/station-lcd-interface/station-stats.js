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
  constructor(base_url, refresh = 300000) {
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
    try {
      display.lcd.setCursor(6, 0) // column, then row
      display.lcd.print(`B:${voltage.battery}V`)
      display.lcd.setCursor(6, 1)
      display.lcd.print(`S:${voltage.solar}V`)
      // await this.createBattChar(Number(voltage.battery))
    } catch (e) {
      console.error('lcd voltage error', e)
      // await this.createBattChar(null)
    }
  }

  async createBattChar(voltage) {
    // create top part of battery icon
    display.lcd.createChar(battery.top.char, battery.top.byte)

    // create empty bar of battery icon
    display.lcd.createChar(battery.empty_bar.char, battery.empty_bar.byte)

    // print top part of battery
    display.lcd.setCursor(9, 0)
    display.lcd.print(battery.top.hex)

    if (voltage > thresholds.battery.max) {

      // print bar0
      display.lcd.setCursor(6, 0)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(7, 0)
      display.lcd.print(battery.full_bar.hex)

      // print bar2
      display.lcd.setCursor(8, 0)
      display.lcd.print(battery.full_bar.hex)

    } else if (voltage <= thresholds.battery.max && voltage > thresholds.battery.min) {

      // print bar0
      display.lcd.setCursor(6, 0)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(7, 0)
      display.lcd.print(battery.full_bar.hex)

      // print bar2
      display.lcd.setCursor(8, 0)
      display.lcd.print(battery.empty_bar.hex)


    } else if (voltage <= thresholds.battery.min) {

      // print bar0
      display.lcd.setCursor(6, 0)
      display.lcd.print(battery.full_bar.hex)

      // print bar1
      display.lcd.setCursor(7, 0)
      display.lcd.print(battery.empty_bar.hex)

      // print bar2
      display.lcd.setCursor(8, 0)
      display.lcd.print(battery.empty_bar.hex)
    } else {
      display.lcd.setCursor(6, 0)
      display.lcd.print(battery.warning.hex)
    }
  }

  async getSolarVoltage(voltage) {
    try {
      await this.createSolarChar(Number(voltage.solar))
    } catch (e) {
      console.error('lcd solar error', e)
      await this.createSolarChar(null)
    }
  }

  async createSolarChar(voltage) {

    if (voltage > thresholds.solar.max) {
      display.lcd.createChar(solar.block_left.char, solar.block_left.byte.high)
      display.lcd.setCursor(11, 0)
      display.lcd.print(solar.block_left.hex)

      display.lcd.createChar(solar.block_right.char, solar.block_right.byte.high)
      display.lcd.setCursor(12, 0)
      display.lcd.print(solar.block_right.hex)

    } else if (voltage <= thresholds.solar.max && voltage > thresholds.solar.min) {
      display.lcd.createChar(solar.block_left.char, solar.block_left.byte.med)
      display.lcd.setCursor(11, 0)
      display.lcd.print(solar.block_left.hex)

      display.lcd.createChar(solar.block_right.char, solar.block_right.byte.med)
      display.lcd.setCursor(12, 0)
      display.lcd.print(solar.block_right.hex)

    } else if (voltage <= thresholds.solar.min) {
      display.lcd.createChar(solar.block_left.char, solar.block_left.byte.low)
      display.lcd.setCursor(11, 0)
      display.lcd.print(solar.block_left.hex)

      display.lcd.createChar(solar.block_right.char, solar.block_right.byte.low)
      display.lcd.setCursor(12, 0)
      display.lcd.print(solar.block_right.hex)

    } else {
      display.lcd.setCursor(11, 2)
      display.lcd.print(battery.warning.hex)
    }
  }

  async getTempValues(temperature) {
    try {
      let { celsius, fahrenheit } = temperature

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
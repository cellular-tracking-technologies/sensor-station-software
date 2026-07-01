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
    this.modem_url = url.resolve(base_url, 'modem')
    this.autoRefresh = refresh
  }
  loading() {
    // return [this.header, "Loading..."]
    return []
  }
  async results() {
    try {
      // Bound every fetch with a timeout. Without one, a hung hardware-server
      // request (e.g. /modem while mmcli is momentarily busy) never settles, so
      // results() never resolves — the menu-manager refresh chain then never
      // re-arms and the screen is left blank permanently (loading() clears it
      // first). A 3s abort turns a hang into a rejection we handle and recover from.
      const [voltages, temperature, modem] = await Promise.all([
        fetch(this.volt_url, { signal: AbortSignal.timeout(3000) }).then(r => r.json()),
        fetch(this.temp_url, { signal: AbortSignal.timeout(3000) }).then(r => r.json()),
        fetch(this.modem_url, { signal: AbortSignal.timeout(3000) }).then(r => r.json()).catch(() => null),
      ])

      await this.getBattVoltage(voltages)
      await this.getTempValues(temperature)

      // Wifi is still read in-process (no equivalent /wifi endpoint yet).
      // Modem now flows through hardware-server's /modem cache so the LCD
      // doesn't fork its own mmcli subprocesses on each refresh.
      const network = Network.Wifi.GetCurrentNetwork()

      const wifi_signal = network && network.connected == true ? network.signal : undefined
      // Show modem signal whenever the modem is alive and reporting a value.
      // Don't gate on state=='connected' — ModemManager only reports 'connected'
      // when MM owns the bearer. With the Telit RNDIS path the bearer is set
      // up at the modem (AT#RNDIS / AT#IPPASSTH), so MM sees 'registered' and
      // never advances to 'connected' even though data is flowing fine.
      const live_states = ['connected', 'registered', 'enabled', 'searching']
      const modem_signal = (modem && live_states.includes(modem.state) && typeof modem.signal === 'number')
        ? modem.signal
        : undefined
      const modem_rssi = (modem_signal !== undefined) ? modem.rssi : undefined

      await this.createWifiChar(wifi_signal)
      await this.createCellChar(modem_signal, modem_rssi)
    } catch (err) {
      console.error('lcd client error', err)
    }
  }

  clearScreen() {
    display.clear()
  }


  async createWifiChar(percent) {

    display.lcd.createChar(wifi.block.char, wifi.block.byte)
    display.lcd.setCursor(0, 0)
    display.lcd.print(wifi.block.hex)

    if (percent) {
      display.lcd.setCursor(1, 0)
      display.lcd.print(`:${percent}%`)

    } else {
      display.lcd.setCursor(1, 0)
      display.lcd.print(':!')
    }
  }


  async createCellChar(signal, rssi) {

    if (signal) {
      display.lcd.createChar(cell.block.char, cell.block.byte)
      display.lcd.setCursor(0, 2)
      display.lcd.print(cell.block.hex)

      display.lcd.setCursor(1, 2)
      display.lcd.print(`:${signal}%`)
      display.lcd.setCursor(1, 3)
      display.lcd.print(`:${rssi} dBm`)
    } else {
      display.lcd.createChar(cell.block.char, cell.block.byte)
      display.lcd.setCursor(0, 2)
      display.lcd.print(cell.block.hex)

      display.lcd.setCursor(1, 2)
      display.lcd.print(':!')
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
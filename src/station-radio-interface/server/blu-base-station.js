
// import SerialClient from '../../hardware/bluseries-receiver/driver/serial_client.js'
// import fs from 'fs'
import Leds from '../../hardware/bluseries-receiver/driver/leds.js'
import { BluReceiver, BluReceiverTask } from '../../hardware/bluseries-receiver/blu-receiver.js'
import fs from 'fs'
import process from 'node:process'
import moment from 'moment'
import EventEmitter from 'events'


// class BluStation {
class BluStation extends BluReceiver {
  constructor(opts) {
    super({
      path: opts.path
    })
    this.data_manager = opts.data_manager
    this.broadcast = opts.broadcast
    this.buffer_interval
    this.blu_radios = {}
    this.beeps
    this.dropped
  }

  /**
   * 
   * @param {Number} radio_channel 
   */
  getBluVersion(radio_channel) {
    
    setTimeout(() => {
      this.schedule({
        task: BluReceiverTask.VERSION,
        radio_channel: radio_channel,
        // data
      })
    }, 10000)
  }

  /**
   * 
   * @param {Number} radio_channel 
   */
  rebootBluReceiver(radio_channel, poll_interval) {
    setTimeout(() => {
      this.setLogoFlash(radio_channel, { led_state: 2, blink_rate: 100, blink_count: 10 })
    }, 5000)

    this.stopDetections(radio_channel)
    this.schedule({
      task: BluReceiverTask.REBOOT,
      radio_channel: radio_channel
    })

    setTimeout(() => {
      this.setBluConfig(radio_channel,
        {
          scan: 1,
          rx_blink: 1,
        })
      this.getDetections(radio_channel, poll_interval)
      this.setLogoFlash(radio_channel, { led_state: 2, blink_rate: 1000, blink_count: -1 })
      this.getBluVersion(radio_channel)
      }, 10000)
    // restart radio with poll interval of 10s
    
  }

  /**
   * 
   * @param {Number} radio_channel 
   * @returns Dropped Detections
   */
  getDroppedDetections(radio_channel, buffer_interval) {
    // console.log('BluReceiverTask.STATS', job.task)
    this.dropped = setInterval(() => {
      this.schedule({
        task: BluReceiverTask.STATS,
        radio_channel: radio_channel,
      })
    }, buffer_interval)
    return this.dropped
  }

  /**
   * 
   * @param {Number} radio_channel Blu Radio Channel
   * @param {Number} buffer_interval Time in milliseconds between ring buffer is cleared of tags
   * @returns BLE tag detections
   */
  getDetections(radio_channel, buffer_interval) {
    const key = radio_channel.toString()
    this.beeps = setInterval(() => {
      this.schedule({
        task: BluReceiverTask.DETECTIONS,
        radio_channel,
      })
    }, buffer_interval)
    this.getDroppedDetections(radio_channel, buffer_interval)
    if(Object.keys(this.blu_radios).includes(key)) {
      // if channel exists within detections object, do nothing
      this.blu_radios[key] = { polling: this.beeps, dropped: this.dropped, }

    } else {
      // if channel does not exist, channel is added to object and its value as key and the setInterval as value
      this.blu_radios[key] = { polling: this.beeps, dropped: this.dropped, }

    }
    return this.blu_radios[key].polling
  }

  /**
   * @param {Number} radio_channel 
   */
  stopDetections(radio_channel) {
    const key = radio_channel.toString()
    
    if(Object.keys(this.blu_radios).includes(key)) {
      clearInterval(this.blu_radios[key].polling)
      clearInterval(this.blu_radios[key].dropped)
      this.setBluConfig(Number(key), { scan: 0, rx_blink: 0,})
      this.setLogoFlash(Number(key), {led_state: 0, blink_rate: 0,  blink_count: 0,})
    }
  }
  /**
 * 
 * @param {Number} radio_channel Radio Channel
 * @param {Number} led_state Led State {Blink|On|Off}
 * @param {Number} blink_rate Blink per ms
 * @param {Number} blink_count Number of blinks before turning off
 */
  setLogoFlash(radio_channel, opts) {
    // setTimeout(() => {
    console.log('set logo flash radio channel', radio_channel, 'opts', opts)
    this.schedule({
      task: BluReceiverTask.LEDS,
      radio_channel: radio_channel,
      data: {
        led_channel: Leds.type.logo,
        state: opts.led_state, // ? opts.led_state : Leds.state.blink,
        blink_rate_ms: opts.blink_rate, //? opts.blink_rate : 1000,
        blink_count: opts.blink_count //? opts.blink_count : -1,
      }
    })
    // }, timeout ? timeout : 0)
  }
  /**
   * 
   * @param {Number} radio_channel 
   * @param {Boolean} opts.scan Radio scanning for tags
   * @param {Boolean} opts.rx_blink Sets radio LED to blink if tag is detected
   * @returns 
   */
  setBluConfig(radio_channel, opts) {
    console.log('getbluconfigf opts', opts)

    if (opts.rx_blink == true) {
      console.log('Radio', radio_channel, 'LED is on')
    } else {
      console.log('Radio', radio_channel, 'LED is off')
    }
    return this.schedule({
      task: BluReceiverTask.CONFIG,
      radio_channel,
      data: {
        scan: opts.scan,
        rx_blink: opts.rx_blink,
      },
      status: {
        scan: opts.scan,
        rx_blink: opts.rx_blink,
      }
    })
  }

  /**
   * 
   * @param {Number} milliseconds 
   * @returns Promise
   */
  delay(milliseconds) {
    return new Promise(resolve => {
      setTimeout(resolve, milliseconds);
    });
  }

  async startUpFlashLogo() {

    await this.delay(1000)
    this.setLogoFlash(1, { led_state: 1, blink_rate: null, blink_count: null, })
    await this.delay(1000)
    this.setLogoFlash(2, { led_state: 1, blink_rate: null, blink_count: null, })
    await this.delay(1000)
    this.setLogoFlash(3, { led_state: 1, blink_rate: null, blink_count: null, })
    await this.delay(1000)
    this.setLogoFlash(4, { led_state: 1, blink_rate: null, blink_count: null, })
    await this.delay(1000)

    setTimeout(() => {
    // blink logo 3 times
    this.setLogoFlash(1, { led_state: 2, blink_rate: 100, blink_count: 6, })
    this.setLogoFlash(2, { led_state: 2, blink_rate: 100, blink_count: 6, })
    this.setLogoFlash(3, { led_state: 2, blink_rate: 100, blink_count: 6, })
    this.setLogoFlash(4, { led_state: 2, blink_rate: 100, blink_count: 6, })
   }, 10000)
  }

  /**
   * 
   * @param  {...any} msgs 
   */
  stationLog(...msgs) {

  }

  /**
   *  @param {Number} radio_channel // Radio Channel to turn on
   *  @param {Number} poll_interval // Time in ms between emptying ring buffer
   */
  radioOn(radio_channel, poll_interval) {
    setTimeout(() => {
      this.setBluConfig(radio_channel, { scan: 1, rx_blink: 1,})
      this.getDetections(radio_channel, poll_interval)
      this.setLogoFlash(radio_channel, { led_state: 2, blink_rate: 1000, blink_count: -1, })

    }, 10000)
    console.log('radio ', radio_channel, 'is on at', poll_interval, 'poll rate')
  }

  /**
   * 
   * @param {*} radio_channel Radio Channel to turn off 
   */
  radioOff(radio_channel) {
    this.setLogoFlash(radio_channel, { led_state: 0, blink_rate: null, blink_count: null, })
    this.setBluConfig(radio_channel, { scan: 0, rx_blink: 0,})
    this.stopDetections(radio_channel)
    let key = radio_channel.toString()
    clearInterval(this.blu_radios[key]) // changes timers _destroyed key to true
    // this.blu_radios[key]._destroyed = true // changes timers _destroyed key to true
    // this.blu_radios[key] = null // sets polling and dropped detection timers as null
    // this.on('close', function() {
    //   return console.log(`exiting the code ${0}`)
    // })
    // process.on('SIGNIT', function() {
    //   console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" )
    //   process.exit(0)
    // })
    console.log('active blu radios', this.blu_radios)
    // process.exit(0)
  }

  updateBluFirmware(radio_channel, firmware_file) {
    console.log('update firmware', firmware_file)
    this.schedule({
      task: BluReceiverTask.DFU,
      radio_channel,
      data: {
        // channel: radio_channel,
        file: firmware_file,
      }
    })
    this.stopDetections(radio_channel)
    this.setLogoFlash(Number(radio_channel), { led_state: 2, blink_rate: 100,  blink_count: 1000,})
      this.rebootBluReceiver(radio_channel, 10000)
      // this.schedule({
      //   task: BluReceiverTask.REBOOT,
      //   radio_channel: radio_channel
      // })
    setTimeout(() => {
      this.getBluVersion(radio_channel)
    }, 20000)
  }

  updateConfig(config_obj) {
    fs.writeFileSync('./src/station-radio-interface/server/default-config.js',
    'export default' + JSON.stringify(config_obj),
    { encoding: 'utf8', flag: 'w', },
    err => {
      if (err) throw err;
      console.log('blu default config file updated')
    })
  }
}

export { BluStation }
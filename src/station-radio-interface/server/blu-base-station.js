import Leds from '../../hardware/bluseries-receiver/driver/leds.js'
import { BluReceiver, BluReceiverTask } from '../../hardware/bluseries-receiver/blu-receiver.js'
import fs from 'fs'
import moment from 'moment'

class BluStation extends BluReceiver {
  constructor(opts) {
    // console.log('blu station opts', opts)
    super({
      path: opts.path
    })
    this.path = opts.path
    this.data_manager = opts.data_manager
    this.broadcast = opts.broadcast
    this.sensor_socket_server = opts.websocket
    this.buffer_interval
    this.beeps
    this.dropped
    this.station_id
    this.blu_channels
    this.blu_receivers = opts.blu_receivers
    this.blu_radios
    this.blu_reader
    // this.blu_config
    // this.firmware = '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/blu_adapter_v1.0.0+0.bin'

    console.log('a new blu station is born!', this)
  }

  /**
  * 
  * @param  {...any} msgs wrapper for data logger
  */
  stationLog(...msgs) {
    this.data_manager.log(msgs)
  }

  /**
   * 
   * @param {Number} radio_channel 
   */
  async getBluVersion(radio_channel) {
    try {
      return this.schedule({
        task: BluReceiverTask.VERSION,
        radio_channel: radio_channel,
      })
    } catch (e) {
      console.error('GET VERSION ERROR', e)
    }
  }

  /**
   * 
   * @param {Object} radio_object 
   */
  async rebootBluReceiver(radio_object, poll_interval) {
    console.log('reboot blu receiver radio object', radio_object)
    await this.setLogoFlash(radio_object.radio, { led_state: 2, blink_rate: 100, blink_count: 10 })
    await this.stopDetections(radio_object)
    await this.schedule({
      task: BluReceiverTask.REBOOT,
      radio_channel: radio_object.radio
    })

    await this.getDetections(radio_object.radio, poll_interval)

    // restart radio with poll interval of 10s

  }

  /**
   * 
   * @param {Number} radio_channel 
   * @returns Dropped Detections
   */
  async getDroppedDetections(radio_channel, buffer_interval) {
    this.schedule({
      task: BluReceiverTask.STATS,
      radio_channel: radio_channel,
    })
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
  async getDetections(radio_channel, buffer_interval) {
    console.log('blu get detections radio channel', radio_channel)
    try {
      // const key = radio_channel.toString()
      this.schedule({
        task: BluReceiverTask.DETECTIONS,
        radio_channel,
      })
      this.beeps = setInterval(() => {
        this.schedule({
          task: BluReceiverTask.DETECTIONS,
          radio_channel,
        })
      }, buffer_interval)
      this.getDroppedDetections(radio_channel, buffer_interval)

      let radio_index = this.blu_receivers.blu_radios.findIndex(radio => radio.radio == radio_channel)
      this.blu_receivers.blu_radios[radio_index] = {
        radio: radio_channel,
        poll_interval: buffer_interval,
        beeps: this.beeps,
        dropped: this.dropped,
      }
      // console.log('get detections blu receiver radios', this.blu_receivers.blu_radios)
      // if (Object.keys(this.blu_radios).includes(key)) {
      //   // if channel exists within detections object, do nothing
      //   this.blu_radios[key] = { polling: this.beeps, dropped: this.dropped, }
      // } else {
      //   // if channel does not exist, channel is added to object and its value as key and the setInterval as value
      //   this.blu_radios[key] = { polling: this.beeps, dropped: this.dropped, }
      // }

      // return this.blu_radios[key].polling
    } catch (e) {
      console.log('getDetections error', e)
    }
  }

  /**
   * @param {Object} radio_object Radio Object that contains radio number and poll interval in ms
   */
  async stopDetections(radio_object) {
    // console.log('stop detections radio', radio)
    // const key = radio_channel.toString()
    // let radio_index = this.blu_receivers.blu_radios.findIndex(radio => radio.radio == radio_channel)
    this.setBluConfig(radio_object.radio, { scan: 0, rx_blink: 0, })
    this.setLogoFlash(radio_object.radio, { led_state: 0, blink_rate: 0, blink_count: 0, })
    // console.log('stop detections radio', radio)
    clearInterval(radio_object.beeps)
    clearInterval(radio_object.dropped)
  }

  /**
 * 
 * @param {Number} radio_channel Radio Channel
 * @param {Number} led_state Led State {Blink|On|Off}
 * @param {Number} blink_rate Blink per ms
 * @param {Number} blink_count Number of blinks before turning off
 */
  async setLogoFlash(radio_channel, opts) {

    return this.schedule({
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
   * @param {Number} radio_channel Radio Channel
   * @param {Boolean} opts.scan Radio scanning for tags
   * @param {Boolean} opts.rx_blink Sets radio LED to blink if tag is detected
   * @returns 
   */
  async setBluConfig(radio_channel, opts) {
    console.log('set blu config radio channel', radio_channel)
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

    let blu_leds = [1, 2, 3, 4]
    const logo_start = await Promise.all(blu_leds.map((led) => {
      this.delay(1000)
      this.setLogoFlash(led, { led_state: 1, blink_rate: null, blink_count: null, })
    })).then((value) => {
      console.log('logo led is turning on', value)
    }).catch((e) => {
      console.error(e)
    })

    const logo_flash = await Promise.all(blu_leds.map((led) => {
      this.setLogoFlash(led, { led_state: 2, blink_rate: 500, blink_count: 6, })
    })).then((value) => {
      console.log('logo leds are flashing', value)
    }).catch((e) => {
      console.error(e)
    })
  }

  /**
  //  *  @param {Number} radio_channel // Radio Channel to turn on
   *  @param {Object} radio
   *  @param {Number} poll_interval // Time in ms between emptying ring buffer
   */
  async radioOn(radio, poll_interval) {
    let radio_channel = radio.radio
    console.log('blu radio on radio', radio_channel)
    await this.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
    await this.getBluVersion(radio_channel)
    await this.getDetections(radio_channel, poll_interval)
    // await this.getDetections(radio, poll_interval)

  }

  /**
   * 
   * @param {Object} radio_object Radio Channel to turn off 
   */
  async radioOff(radio_object) {
    // console.log('blu radio off', radio_object)
    await this.stopDetections(radio_object)
    // let key = radio_channel.toString()
    // clearInterval(this.blu_radios[key]) // changes timers _destroyed key to true
    // let radio_index = this.blu_receivers.blu_radios.findIndex(radio => radio.radio == radio_channel)
    // clearInterval(this.blu_receivers.blu_radios[radio_index])
    clearInterval(radio_object)
  }

  async updateBluFirmware(radio_object, firmware_file, poll_interval, station_port) {
    // console.log('update firmware', firmware_file)
    try {

      await this.getBluVersion(radio_object.radio)
      await this.stopDetections(radio_object)
      await this.setLogoFlash(Number(radio_object.radio), { led_state: 2, blink_rate: 100, blink_count: -1, })
      this.schedule({
        task: BluReceiverTask.DFU,
        radio_channel: radio_object.radio,
        port: station_port,
        data: {
          file: fs.readFileSync(firmware_file),
        }
      })
      await this.rebootBluReceiver(radio_object, poll_interval)
      setTimeout(() => {
        this.schedule({
          task: BluReceiverTask.VERSION,
          radio_channel: radio_object.radio,
        })
      }, 20000)
    } catch (e) {
      console.error('Update firmware error', e)
    }
  }

  async updateConfig(blustation, blu_radio, poll_interval) {
    let station_config = JSON.parse(fs.readFileSync('/etc/ctt/station-config.json'))
    console.log('update config station config', station_config)
    let receiver_index = station_config.blu_receivers.findIndex(receiver => receiver.channel == blustation.port)
    let radio_index = station_config.blu_receivers[receiver_index].blu_radios.findIndex(radio => radio.radio == blu_radio)

    station_config.blu_receivers[receiver_index].blu_radios[radio_index].poll_interval = poll_interval

    fs.writeFileSync('/etc/ctt/station-config.json',
      JSON.stringify(station_config, null, 2),
      { encoding: 'utf8', flag: 'w', },
      err => {
        if (err) throw err;
        console.log('blu radio map file updated')
      })
  }

  destroy(radio) {
    clearInterval(radio.polling)
    clearInterval(radio.dropped)
    radio.polling.destroyed = true
    radio.dropped.destroyed = true
  }

  destroy_receiver() {

    delete this.polling
    delete this.dropped
    delete this.firmware
    delete this.blu_fw
    delete this.blu_channels
    delete this.blu_radios
    delete this.blu_receivers
    delete this.data_manager
    delete this.broadcast
    delete this.sensor_socket_server
    this.destroyed_port = this.port
    delete this.port
    delete this.path
    delete this.beeps
    // delete this
  }

  sendBluPort(path) {
    let add_index = this.findBluPath(path)
    let port = this.blu_receiver[add_index].port

    let add_receiver = {
      msg_type: 'add_port',
      port: port,
      poll_interval: this.blu_receivers[port.toString()].settings.values.current,
    }
    console.log('send blu port', add_receiver)
    this.broadcast(JSON.stringify(add_receiver))
  }

  startBluRadios(path) {

    // let blu_radio = this.findBluReceiver(path)
    // console.log('blu radio', blu_radio)
    // this.path = blu_radio.path
    // this.port = blu_radio.channel
    // this.blu_channels = blu_radio.blu_radios
    // let br_index = this.blu_radios.findIndex(radio => blu_reader.path === this.path)
    // console.log('start blu radios blu receivers', this.blu_receivers)
    this.path = this.blu_receivers.path
    this.port = this.blu_receivers.channel
    // console.log('blu receiver this.blu_radios', this.blu_receivers.blu_radios)
    setTimeout(() => {

    }, 2000)

    this.on('complete', (job) => {
      switch (job.task) {
        case BluReceiverTask.VERSION:
          try {
            console.log(`BluReceiverTask.VERSION Port ${this.port} ${JSON.stringify(job)}`)

            this.blu_fw = {
              msg_type: 'blu-firmware',
              firmware: {
                [this.port]: {
                  channels: {
                    [job.radio_channel]: job.data.version,
                  }
                }
              }
            }
            this.broadcast(JSON.stringify(this.blu_fw))
          } catch (e) {
            console.error('basestation getBluVersion error:', e)
          }
          break
        case BluReceiverTask.DETECTIONS:
          try {
            // console.log('blu detections job', job)
            console.log('Port', this.port, 'radio', job.radio_channel, 'has', job.data.length, 'detections')
            // console.log('blu receiver detections', this.blu_channels)
            job.data.forEach((beep) => {
              // console.log('blu reader beep', beep)

              beep.data = { id: beep.id }
              beep.meta = { data_type: "blu_tag", rssi: beep.rssi, }
              beep.msg_type = "blu"
              beep.protocol = "1.0.0"
              beep.received_at = moment(new Date(beep.time)).utc()
              // beep.receiver = this.blu_receivers.find(receiver => receiver.channel === this.port)
              // console.log('beep receiver')
              beep.radio_index = this.blu_receivers.blu_radios.findIndex(radio =>
                radio.radio == beep.channel
              )

              // console.log('beep radio', beep.radio_index, 'beep receiver', this.blu_receivers.blu_radios[beep.radio_index])
              beep.poll_interval = this.blu_receivers.blu_radios[beep.radio_index].poll_interval
              // console.log('beep poll interval', beep.poll_interval)
              beep.port = this.port
              this.data_manager.handleBluBeep(beep)
              beep.vcc = beep.payload.parsed.solar
              beep.temp = beep.payload.parsed.temp
              this.broadcast(JSON.stringify(beep))
            })
            let blu_sum = {
              port: this.port,
              channel: job.radio_channel,
              blu_beeps: job.data.length == null ? 0 : job.data.length,
              msg_type: "blu_stats",
            }
            this.broadcast(JSON.stringify(blu_sum))
          } catch (e) {
            console.error('base station get detections error on Port', this.port, 'Radio', job.radio_channel, e)
          }
          break
        // console.log(JSON.stringify(job))
        case BluReceiverTask.DFU:
          // dfu download completed and then triggers reboot
          console.log(this.port, `BluReceiverTask.DFU ${JSON.stringify(job)}`)
          break
        case BluReceiverTask.REBOOT:
          console.log(`BluReceiverTask.REBOOT ${JSON.stringify(job)}`)
          console.log('Blu Receiver is rebooting!', job.radio_channel)
          break
        case BluReceiverTask.LEDS:
          console.log(`BluReceiverTask.LEDS ${JSON.stringify(job)}`)
          break
        case BluReceiverTask.CONFIG:
          console.log(`BluReceiverTask.CONFIG ${JSON.stringify(job)}`)
          break
        case BluReceiverTask.STATS:
          // console.log('blu stats job', job)
          try {

            let blu_stats = {
              port: this.port,
              channel: job.radio_channel,
              blu_dropped: job.data.det_dropped == null ? 0 : job.data.det_dropped,
              msg_type: "blu_dropped",
            }
            console.log('Port', this.port, 'radio', job.radio_channel, 'has', blu_stats.blu_dropped, 'detections dropped')

            this.broadcast(JSON.stringify(blu_stats))
          } catch (e) {
            console.log('base station stats error:', 'receiver', this.port, 'radio', job.radio_channel, e)
          }
          break
        default:
          break
      }
    })

    this.startUpFlashLogo()

    setInterval(() => {
      this.getBluVersion(1)
      this.getBluVersion(2)
      this.getBluVersion(3)
      this.getBluVersion(4)
    }, 10000)

    const radios_start = Promise.all(this.blu_receivers.blu_radios
      .map((radio) => {
        console.log('radios start radio', radio)
        let radio_key = radio.radio
        this.radioOn(radio, radio.poll_interval)
      })).then((values) => {
        console.log('radios started')
      }).catch((e) => {
        console.error('radios could not start properly', e)
      })

    this.on('close', () => {
      console.log('blu receiver closing within startBluRadios')
    })

    // process.on('SIGINT', () => {

    //   if (this.port) {
    //     // console.log("\nGracefully shutting down from SIGINT (Ctrl-C)", this.port)
    //     let radio_index = this.blu_receivers.blu_radios.findIndex(radio => radio.radio == job.radio_channel)
    //     console.log("\nGracefully shutting down from SIGINT (Ctrl-C)")
    //     const radios_exit = Promise.all(this.blu_receivers.blu_radios[radio_index]
    //       .map((radio) => {
    //         // let radio_num = Number(radio.radio)
    //         this.radioOff(radio)
    //         // console.log('receiver', this.port, 'radio', radio, 'is off')
    //       }))
    //     Promise.all(radios_exit).then((values) => {
    //       console.log(values)
    //     }).catch((e) => {
    //       console.error('no port to closed in destroyed blu receiver', e)
    //     })
    //   } else {
    //     console.log("\nGracefully shutting down from SIGINT (Ctrl-C)", this)

    //   }

    //   // uncomment to destroy each receiver, need to find way to do this after turning off all radios in receiver
    //   // this.blu_receiver.forEach((receiver) => {
    //   //   receiver.destroy_receiver()
    //   // })
    //   setTimeout(() => {
    //     console.log('Closed blu readers', this)
    //     process.exit(0)
    //   }, 7000)
    // })
    // }) // end of forEach
  } // end of startBluRadios

  stopBluRadios(path) {
    if (path !== undefined) {
      console.log('stop blu radios path', path)
      // let br_index = this.findBluPath(path)

      console.log('blu receiver', this, 'is closing')
      const radios_exit = Promise.all(this.blu_receivers.blu_radios
        .map((radio) => {
          this.radioOff(radio)
          console.log('receiver', this.port, 'radio', radio.radio, 'is off')
        }))
      Promise.all(radios_exit).then((values) => {
        console.log(values)
      }).catch((e) => {
        console.error('can\'t turn off all radios, probably because receiver was destroyed', e)
      })

      setTimeout(() => {
        console.log('Closed blu readers', this)
      }, 5000)
    } else {
      console.log('no path to clear')
    }
  }

  /**
   * 
   * @param {String} port 
   * @returns 
   */
  findBluPort(port) {
    let index = this.blu_receivers.findIndex(receiver => receiver.channel === Number(port))
    return index
  }

  /**
   * 
   * @param {String} path 
   * @returns 
   */
  findBluPath(path) {
    let index = blu_channels.findIndex(receiver => receiver.path === path.substring(17))
    console.log('findBluPath index', index)
    return index
  }

  /**
  * 
  * @param {String} path radio path from /dev/serial/by-path/ directory 
  * @returns 
  */
  findBluReceiver(path) {
    // let radio_path = path.substring(17)
    // let radio_path = path
    // let radio_index = this.blu_receivers.findIndex(radio => radio.path === radio_path)
    // let radio = this.blu_receivers[radio_index]
    // return radio
    console.log('findBluReceiver path', path)
    let receiver_path = path.substring(17)
    let receiver_index = this.blu_receivers.findIndex(receiver => receiver.path === receiver_path)
    let receiver = this.blu_receivers[receiver_index]
    console.log('find blu receiver receiver', receiver)
    return receiver
  }
}

class BluStations {
  constructor(opts) {
    this.blu_stations = []
    // this.sensor_socket_server = opts.websocket
    this.firmware = '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/blu_adapter_v1.0.0+0.bin'

  }

  newBluStation(opts) {
    let b = new BluStation({
      path: opts.path,
      blu_receivers: opts.blu_receivers,
      data_manager: opts.data_manager,
      broadcast: opts.broadcast,
      websocket: opts.websocket,
    })
    this.blu_stations.push(b)
    // b = undefined
    // return b
  }

  get getAllBluStations() {
    return this.blu_stations
  }


}

export { BluStation, BluStations }
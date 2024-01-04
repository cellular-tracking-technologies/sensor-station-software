import Leds from '../../hardware/bluseries-receiver/driver/leds.js'
import { BluReceiver, BluReceiverTask } from '../../hardware/bluseries-receiver/blu-receiver.js'
import fs from 'fs'
import blu_receivers from '../../../system/radios/blu-radio-map.js'

import moment from 'moment'

class BluStation extends BluReceiver {
  constructor(opts) {
    console.log('blu station opts', opts)
    super({
      path: opts.path
    })
    this.data_manager = opts.data_manager
    this.broadcast = opts.broadcast
    // this.config = opts.config
    this.sensor_socket_server = opts.websocket
    this.buffer_interval
    this.beeps
    this.dropped
    this.station_id
    this.blu_radios = {}
    this.blu_receivers = blu_receivers
    this.blu_reader
    this.firmware = '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/blu_adapter_v1.0.0+0.bin'

  }

  /**
 * get base station id
 */
  getId() {
    return fs.readFileSync('/etc/ctt/station-id').toString().trim()
  }

  /**
  * start web socket server
  */
  startWebsocketServer() {

    this.sensor_socket_server.on('open', (event) => {

    })
    this.sensor_socket_server.on('cmd', (cmd) => {
      switch (cmd.cmd) {
        case ('blu_radio_all_on'):
          // let all_on_port = cmd.data.port
          let all_on_index = this.findBluPort(cmd.data.port)
          console.log('blu radios all on: blu receivers object', this.blu_receivers, 'index number', all_on_index, 'index object', this.blu_receivers[all_on_index])

          // const radios_on = Object.keys(this.blu_receiver[all_on_index].blu_radios).map(radio => {
          const radios_on = Promise.all(Object.keys(this.blu_receivers[all_on_index].blu_radios).map(radio => {
            this.blu_receivers[all_on_index].blu_radios[radio].values.current = Number(cmd.data.poll_interval)
            // this.config.default_config.blu_receivers = this.blu_receivers
            this.updateConfig(this.blu_receivers)
            this.radioOn(Number(radio), cmd.data.poll_interval)
          })).then((values) => {
            console.log('all radios on', values)
          }).catch((e) => {
            console.error('all radios on error', e)
          })

          break;
        case ('blu_radio_all_off'):
          let all_off_index = this.findBluPort(cmd.data.port)

          // const radios_off = Object.keys(this.blu_receiver[all_off_index].blu_radios).map(radio => {
          console.log('blu radios all off: blu receivers object', this.blu_receivers, 'index number', all_off_index, 'index object', this.blu_receivers[all_off_index])
          const radios_off = Promise.all(Object.keys(this.blu_receivers[all_off_index].blu_radios).map(radio => {
            this.radioOff(radio)
          })).then((values) => {
            console.log('turning blu radio off', values)
          }).catch((e) => {
            console.error('all radios off error', e)
          })
          break
        case ('blu_led_all'):
          let all_led_index = this.findBluPort(cmd.data.port)

          // const all_leds = Object.keys(this.blu_receiver[all_led_index].blu_radios).map(radio => {
          const all_leds = Promise.all(Object.keys(this.blu_receivers[all_led_index].blu_radios).map(radio => {
            this.setBluConfig(Number(radio), { scan: cmd.data.scan, rx_blink: cmd.data.rx_blink, })
          })).then((values) => {
            console.log('turning radio leds on', values)
          }).catch((e) => {
            console.log('cannot turn radio leds on', e)
          })
          break
        case ('blu_reboot_all'):
          let reboot_index_all = this.findBluPort(cmd.data.port)

          let radios_reboot = Promise.all(Object.keys(this.blu_receivers[reboot_index_all].blu_radios).forEach((radio) => {
            console.log('reboot all index', reboot_index_all)
            console.log('reboot all radios on receiver', this.blu_receivers[radio])
            let reboot_default_poll = this.blu_receivers[cmd.data.port].blu_radios[radio].values.default
            console.log('default polling interval', reboot_default_poll)
            this.blu_receivers[reboot_index_all].blu_radios[radio].values.current = reboot_default_poll

            this.poll_data = {
              channel: radio,
              poll_interval: this.blu_receivers[reboot_index_all].blu_radios[radio].values.default,
              msg_type: 'poll_interval',
            }
            console.log('after reboot', this.poll_data)
            this.broadcast(JSON.stringify(this.poll_data))
            this.rebootBluReceiver(Number(radio), this.poll_data.poll_interval)
            // this.config.default_config.blu_receivers = this.blu_receivers
            this.updateConfig(this.blu_receivers)

          })).then((values) => {
            console.log('all radios rebooting', values)
          }).catch((e) => {
            console.error('all radios reboot error', e)
          })

          break
        case ('all_change_poll'):
          let change_poll_all_port = cmd.data.port.toString()
          let change_poll_all_index = this.findBluPort(change_poll_all_port)
          // console.log('change poll blu receiver', this.blu_receiver[change_poll_all_index])
          // let port_key = cmd.data.port.toString()

          console.log('changing polling interval on Radio', cmd)
          this.poll_interval = Number(cmd.data.poll_interval)

          // set current poll interval in default-config
          let radios_all_poll = Promise.all(Object.keys(this.blu_receivers[change_poll_all_index].blu_radios).forEach((radio) => {
            console.log('change poll radio', radio)
            this.blu_receivers[change_poll_all_index].blu_radios[radio].values.current = this.poll_interval
            console.log('radio', radio, 'is polling at', this.blu_receivers[change_poll_all_index].blu_radios[radio].values.current, 'poll interval')
            this.poll_data = {
              port: cmd.data.port,
              channel: radio,
              poll_interval: this.poll_interval,
              msg_type: 'poll_interval',
            }
            // this.config.default_config.blu_receivers = this.blu_receivers
            console.log('default config blu receivers after poll change', this.blu_receivers)
            this.updateConfig(this.blu_receivers)

            this.broadcast(JSON.stringify(this.poll_data))
            console.log('poll interval', this.poll_interval, typeof this.poll_interval)

            this.stopDetections(Number(radio))
            this.setBluConfig(Number(radio), { scan: 1, rx_blink: 1, })
            this.getDetections(Number(radio), this.poll_interval)
          })).then((values) => {
            console.log('all radios change poll', values)
          }).catch((e) => {
            console.error('all radios change poll error', e)
          })

          break
        case ('blu_update_all'):
          console.log('updating blu series receiver firmware', cmd)
          let update_all_index = this.findBluPort(cmd.data.port)

          const blu_update_all = Promise.all(Object.keys(this.blu_receivers[update_all_index].blu_radios).forEach((radio) => {
            let current_poll_interval = this.blu_receivers[update_all_index].blu_radios[radio].values.current
            console.log('update firmware poll interval', current_poll_interval)

            console.log('update blu firmware default poll interval', this.blu_receivers[update_all_index].blu_radios[radio].values.current)

            this.updateBluFirmware(Number(radio), this.firmware, current_poll_interval)
          })).then((values) => {
            console.log('turning blu radio off', values)
          }).catch((e) => {
            console.error(`Can't update all radios on port ${cmd.data.port}`)
          })
          break
        case ('toggle_blu'):
          console.log('blu radio button clicked', cmd)

          if (cmd.data.type === 'blu_on') {
            console.log('turning blu radio on')
            let br_index = this.findBluPort(cmd.data.port)
            let radio_on = cmd.data.channel
            console.log('turn radios on blu receiver', this.blu_receivers[br_index])

            this.blu_receivers[br_index].blu_radios[Number(radio_on)].values.current = Number(cmd.data.poll_interval)
            // this.config.default_config.blu_receivers = this.blu_receivers
            this.updateConfig(this.blu_receivers)
            this.radioOn(Number(radio_on), cmd.data.poll_interval)

          } else if (cmd.data.type === "blu_off") {
            let br_index = this.findBluPort(cmd.data.port)
            let radio_off = cmd.data.channel
            this.radioOff(radio_off.toString())
          }
          break
        case ('toggle_blu_led'):
          console.log('blu radio button clicked', cmd)
          // let ledon_index = this.blu_receiver.findIndex(receiver => receiver.port === Number(cmd.data.port))
          // let ledon_index = this.findBluPort(cmd.data.port)
          let ledon_radio = cmd.data.channel
          this.setBluConfig(Number(ledon_radio), { scan: cmd.data.scan, rx_blink: cmd.data.rx_blink, })
          console.log('turning blu led on/off')
          break
        case ('reboot_blu_radio'):
          console.log('blu reboot button clicked', cmd)
          let reboot_index = this.findBluPort(cmd.data.port)
          let reboot_port = cmd.data.port
          let reboot_radio = cmd.data.channel
          console.log('reboot receiver', this.blu_receivers[reboot_port])
          let default_poll = this.blu_receivers[reboot_port].blu_radios[reboot_radio].values.default
          console.log('default polling interval', default_poll)
          this.blu_receivers[reboot_index].blu_radios[reboot_radio].values.current = default_poll

          this.poll_data = {
            channel: reboot_radio,
            poll_interval: this.blu_receivers[reboot_index].blu_radios[reboot_radio].values.default,
            msg_type: 'poll_interval',
          }
          console.log('after reboot', this.poll_data)
          this.broadcast(JSON.stringify(this.poll_data))
          // this.config.default_config.blu_receivers = this.blu_receivers
          this.updateConfig(this.blu_receivers)
          this.rebootBluReceiver(Number(reboot_radio), this.poll_data.poll_interval)
          break
        case ('change_poll'):
          console.log('change poll interval', cmd)
          let br_index = this.findBluPort(cmd.data.port)
          let poll_radio = cmd.data.channel
          console.log('change poll blu receiver', this)
          // let port_key = cmd.data.port.toString()

          console.log('changing polling interval on Radio', cmd)
          this.poll_interval = Number(cmd.data.poll_interval)

          // set current poll interval in default-config
          // Object.keys(this.blu_receivers[this.blu_receiver[br_index].port.toString()].blu_radios).forEach((radio) => {
          console.log('change poll radio', poll_radio)
          // radio.values.current = Number(this.poll_interval)
          this.blu_receivers[br_index].blu_radios[poll_radio].values.current = this.poll_interval
          console.log('radio', poll_radio, 'is polling at', this.blu_receivers[br_index].blu_radios[poll_radio].values.current, 'poll interval')
          this.poll_data = {
            port: cmd.data.port,
            channel: poll_radio,
            poll_interval: this.poll_interval,
            msg_type: 'poll_interval',
          }
          // this.config.default_config.blu_receivers = this.blu_receivers
          this.updateConfig(this.blu_receivers)

          this.broadcast(JSON.stringify(this.poll_data))
          console.log('poll interval', this.poll_interval, typeof this.poll_interval)

          this.stopDetections(Number(poll_radio))
          this.setBluConfig(Number(poll_radio), { scan: 1, rx_blink: 1, })
          this.getDetections(Number(poll_radio), this.poll_interval)
          // })
          break
        case ('update-blu-firmware'):
          console.log('updating blu series receiver firmware', cmd)
          let update_index = this.findBluPort(cmd.data.port)
          let update_radio = cmd.data.channel
          console.log('update blu firmware default poll interval', this.blu_receivers[update_index].blu_radios[update_radio].values.current)
          let poll_interval = this.blu_receivers[update_index].blu_radios[update_radio].values.current
          console.log('update firmware poll interval', poll_interval)

          // Object.keys(this.blu_receiver[update_index].blu_radios).forEach((radio) => {
          this.updateBluFirmware(Number(update_radio), this.firmware, poll_interval)
          // })
          break

        // case ('about'):
        //   fetch('http://localhost:3000/about')
        //     .then(res => res.json())
        //     .then((json) => {
        //       let data = json
        //       data.station_id = this.station_id
        //       data.msg_type = 'about'
        //       data.begin = this.begin
        //       this.broadcast(JSON.stringify(data))
        //     })
        //     .catch((err) => {
        //       console.log('unable to request info from hardware server')
        //       console.error(err)
        //     })
        //   break
        default:
          break
      }
    })
    this.sensor_socket_server.on('client_conn', (ip) => {
      // this.stationLog(`client connected from IP: ${ip}`)
    })
  }

  /**
  * 
  * @param  {...any} msgs wrapper for data logger
  */
  stationLog(...msgs) {
    this.data_manager.log(msgs)
  }

  // /**
  // * 
  // * @param {*} msg - message to broadcast across the web socket server
  // */
  // broadcast(msg) {
  //   if (this.sensor_socket_server) {
  //     this.sensor_socket_server.broadcast(msg)
  //   }
  // }


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
   * @param {Number} radio_channel 
   */
  async rebootBluReceiver(radio_channel, poll_interval) {
    await this.setLogoFlash(radio_channel, { led_state: 2, blink_rate: 100, blink_count: 10 })
    await this.stopDetections(radio_channel)
    this.schedule({
      task: BluReceiverTask.REBOOT,
      radio_channel: radio_channel
    })

    await this.getDetections(radio_channel, poll_interval)

    // restart radio with poll interval of 10s

  }

  /**
   * 
   * @param {Number} radio_channel 
   * @returns Dropped Detections
   */
  async getDroppedDetections(radio_channel, buffer_interval) {
    // console.log('BluReceiverTask.STATS', job.task)
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
    try {
      const key = radio_channel.toString()
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
      if (Object.keys(this.blu_radios).includes(key)) {
        // if channel exists within detections object, do nothing
        this.blu_radios[key] = { polling: this.beeps, dropped: this.dropped, }
      } else {
        // if channel does not exist, channel is added to object and its value as key and the setInterval as value
        this.blu_radios[key] = { polling: this.beeps, dropped: this.dropped, }
      }

      return this.blu_radios[key].polling
    } catch (e) {
      console.log('getDetections error', e)
    }
  }

  /**
   * @param {Number} radio_channel 
   */
  async stopDetections(radio_channel) {
    const key = radio_channel.toString()
    this.setBluConfig(Number(key), { scan: 0, rx_blink: 0, })
    this.setLogoFlash(Number(key), { led_state: 0, blink_rate: 0, blink_count: 0, })
    clearInterval(this.blu_radios[key].polling)
    clearInterval(this.blu_radios[key].dropped)
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
   * @param {Number} radio_channel 
   * @param {Boolean} opts.scan Radio scanning for tags
   * @param {Boolean} opts.rx_blink Sets radio LED to blink if tag is detected
   * @returns 
   */
  async setBluConfig(radio_channel, opts) {
    // console.log('getbluconfigf opts', opts)

    if (opts.rx_blink == true) {
      // console.log('Radio', radio_channel, 'LED is on')
    } else {
      // console.log('Radio', radio_channel, 'LED is off')
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
   *  @param {Number} radio_channel // Radio Channel to turn on
   *  @param {Number} poll_interval // Time in ms between emptying ring buffer
   */
  async radioOn(radio_channel, poll_interval) {
    await this.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
    await this.getBluVersion(radio_channel)
    await this.getDetections(radio_channel, poll_interval)
    // await this.setLogoFlash(radio_channel, { led_state: 2, blink_rate: 1000, blink_count: -1, })
    console.log('radio ', radio_channel, 'is on at', poll_interval, 'poll rate')
  }

  /**
   * 
   * @param {*} radio_channel Radio Channel to turn off 
   */
  async radioOff(radio_channel) {
    await this.stopDetections(radio_channel)
    let key = radio_channel.toString()
    clearInterval(this.blu_radios[key]) // changes timers _destroyed key to true
  }

  async updateBluFirmware(radio_channel, firmware_file, poll_interval) {
    console.log('update firmware', firmware_file)
    try {

      await this.getBluVersion(radio_channel)
      await this.stopDetections(radio_channel)
      await this.setLogoFlash(Number(radio_channel), { led_state: 2, blink_rate: 100, blink_count: -1, })
      this.schedule({
        task: BluReceiverTask.DFU,
        radio_channel,
        data: {
          file: fs.readFileSync(firmware_file),
        }
      })
      await this.rebootBluReceiver(radio_channel, poll_interval)
      console.log('update blu firmware poll interval', poll_interval)
      setTimeout(() => {
        this.schedule({
          task: BluReceiverTask.VERSION,
          radio_channel,
        })
      }, 20000)
      // await this.setLogoFlash(radio_channel, { led_state: 2, blink_rate: 1000, blink_count: -1 })
      // await this.getBluVersion(radio_channel)
    } catch (e) {
      console.error('Update firmware error', e)
    }
  }

  async updateConfig(config_obj) {
    fs.writeFileSync('/lib/ctt/sensor-station-software/system/radios/blu-radio-map.js',
      'export default' + JSON.stringify(config_obj, null, 2),
      { encoding: 'utf8', flag: 'w', },
      err => {
        if (err) throw err;
        console.log('blu radio map file updated')
      })
  }

  destroy(radio) {
    // console.log('blu radio', radio, 'is destroyed')
    // clearInterval(this.blu_reader.blu_radios[radio])
    clearInterval(radio.polling)
    clearInterval(radio.dropped)
    radio.polling.destroyed = true
    radio.dropped.destroyed = true
  }

  destroy_receiver() {

    delete this.polling
    delete this.dropped
    // delete this.blu_radios
    this.destroyed_port = this.port
    delete this.port
    delete this.path
    delete this.beeps
    delete this
  }

  sendBluPort(path) {
    let add_index = this.findBluPath(path)
    // console.log('add index', add_index)

    // console.log('send blu port receiver', this.blu_receiver[add_index])
    let port = this.blu_receiver[add_index].port

    let add_receiver = {
      msg_type: 'add_port',
      port: port,
      poll_interval: this.blu_receivers[port.toString()].settings.values.current,
    }
    console.log('send blu port', add_receiver)
    this.broadcast(JSON.stringify(add_receiver))
    // this.sensor_socket_server.emit(JSON.stringify(add_receiver))
  }

  startBluRadios(path) {

    let blu_radio = this.findBluReceiver(path)
    console.log(' start blu radios blu radio', blu_radio)

    this.path = blu_radio.path
    this.port = blu_radio.channel
    console.log('blu station this', this)
    let br_index = this.blu_receivers.findIndex(blu_reader => blu_reader.path === this.path)

    console.log('blu receiver array on blu base-station file', this.blu_receivers[br_index].blu_radios)

    setTimeout(() => {

    }, 2000)

    this.on('complete', (job) => {
      // this.broadcast(JSON.stringify('blu receiver is complete')) // somehow repeats more than chokidar.on(change)
      switch (job.task) {
        case BluReceiverTask.VERSION:
          try {
            console.log(`BluReceiverTask.VERSION Port ${this.port} ${JSON.stringify(job)}`)
            // this.stationLog(`BluReceiver Radio ${job.radio_channel} is ${job.data.version}`)
            // stationLog(`BluReceiver Radio ${job.radio_channel} is ${job.data.version}`)

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
            // this.broadcast(JSON.stringify(this.blu_fw))
            this.broadcast(JSON.stringify(this.blu_fw))
          } catch (e) {
            console.error('basestation getBluVersion error:', e)
          }
          break
        case BluReceiverTask.DETECTIONS:
          try {
            console.log('Port', this.port, 'radio', job.radio_channel, 'has', job.data.length, 'detections')
            job.data.forEach((beep) => {
              beep.data = { id: beep.id }
              beep.meta = { data_type: "blu_tag", rssi: beep.rssi, }
              beep.msg_type = "blu"
              beep.protocol = "1.0.0"
              beep.received_at = moment(new Date(beep.time)).utc()
              beep.poll_interval = this.blu_receivers[br_index].blu_radios[beep.channel].values.current
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
          // this.stationLog(`BluReceiver Radio ${job.radio_channel} is rebooting`)
          console.log('Blu Receiver is rebooting!', job.radio_channel)
          break
        case BluReceiverTask.LEDS:
          console.log(`BluReceiverTask.LEDS ${JSON.stringify(job)}`)
          break
        case BluReceiverTask.CONFIG:
          console.log(`BluReceiverTask.CONFIG ${JSON.stringify(job)}`)
          // would like to get config data object to log changes to radio/led on/off
          // this.stationLog(`BluReceiver Radio ${job.radio_channel} config has changed.`)
          break
        case BluReceiverTask.STATS:
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

    // setTimeout(() => {

    // const radios_start = Promise.all(Object.keys(this.blu_receivers[blu_receiver.port.toString()].blu_radios)
    const radios_start = Promise.all(Object.keys(this.blu_receivers[br_index].blu_radios)
      .map((radio) => {
        console.log('radios start radio', radio)
        let radio_key = radio.toString()
        let port_key = this.port.toString()
        // blu_receiver.radioOn(Number(radio_key), this.blu_receivers[port_key].blu_radios[radio_key].values.current)
        this.radioOn(Number(radio_key), this.blu_receivers[br_index].blu_radios[radio_key].values.current)
      })).then((values) => {
        console.log('radios started')
      }).catch((e) => {
        console.error('radios could not start properly', e)
      })

    this.on('close', () => {
      console.log('blu receiver closing within startBluRadios')
    })

    process.on('SIGINT', () => {
      // this.stationLog("\nGracefully shutting down from SIGINT (Ctrl-C)")

      if (this.port) {

        console.log("\nGracefully shutting down from SIGINT (Ctrl-C)", this.port)
        const radios_exit = Promise.all(Object.keys(this.blu_receivers[br_index].blu_radios)
          .map((radio) => {
            this.radioOff(radio)
            console.log('receiver', this.port, 'radio', radio, 'is off')
          }))
        Promise.all(radios_exit).then((values) => {
          console.log(values)
        }).catch((e) => {
          console.error('no port to closed in destroyed blu receiver', e)
        })
      } else {
        console.log("\nGracefully shutting down from SIGINT (Ctrl-C)", this)

      }

      // uncomment to destroy each receiver, need to find way to do this after turning off all radios in receiver
      // this.blu_receiver.forEach((receiver) => {
      //   receiver.destroy_receiver()
      // })
      setTimeout(() => {
        console.log('Closed blu readers', this)
        process.exit(0)
      }, 7000)
    })
    // }) // end of forEach
  } // end of startBluRadios

  stopBluRadios(path) {
    if (path !== undefined) {
      console.log('stop blu radios path', path)
      let br_index = this.findBluPath(path)

      // this.stationLog('blu radio is closing')
      console.log('blu receiver', this, 'is closing')
      const radios_exit = Promise.all(Object.keys(this.blu_receivers[br_index].blu_radios)
        .map((radio) => {
          this.radioOff(radio)
          console.log('receiver', this.port, 'radio', radio, 'is off')
        }))
      Promise.all(radios_exit).then((values) => {
        console.log(values)
      }).catch((e) => {
        console.error('can\'t turn off all radios, probably because receiver was destroyed', e)
      })

      // this.blu_receiver[br_index].destroy_receiver()

      setTimeout(() => {
        console.log('Closed blu readers', this)
      }, 5000)
      // })
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
    let index = blu_receivers.findIndex(receiver => receiver.path === path.substring(17))
    // console.log('findBluPath index', index)
    return index
  }

  /**
  * 
  * @param {String} path radio path from /dev/serial/by-path/ directory 
  * @returns 
  */
  findBluReceiver(path) {
    let radio_path = path.substring(17)
    console.log('find blu path path', radio_path, 'blu radios', this.blu_receivers)
    let radio_index = this.blu_receivers.findIndex(radio => radio.path === radio_path)
    // console.log('find blu path radio index', radio_index)
    let radio = this.blu_receivers[radio_index]
    // console.log('find blu path radio', radio)
    return radio
  }
}

class BluStations {
  constructor() {
    this.blu_stations = []
  }

  newBluStation(path, port) {
    let b = new BluStation(path, port)
    this.blu_stations.push(b)
    return b
  }

  get allBluStations() {
    return this.blu_stations
  }
}

export { BluStation, BluStations }
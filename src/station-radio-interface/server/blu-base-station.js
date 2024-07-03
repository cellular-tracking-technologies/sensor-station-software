import { BluReceiverTask } from '../../hardware/ctt/bluseries-receiver/blu-receiver.js'
import BluReceiverManager from '../../hardware/ctt/bluseries-receiver/blu-receiver-manager.js'
import BluFirmwareUpdater from '../../hardware/ctt/bluseries-receiver/blu-firmware-updater.js'

import moment from 'moment'

class BluStation {
  constructor(opts) {
    this.data_manager = opts.data_manager
    this.broadcast = opts.broadcast
    this.sensor_socket_server = opts.websocket
    this.blu_paths = opts.blu_receivers
    this.blu_receivers = []
    this.firmware = opts.blu_firmware
    this.blu_fw
    this.blu_fw_checkin = {}
    this.blu_version
    this.blu_updater = new BluFirmwareUpdater({})
    this.config = opts.config

  }

  /**
 * 
 * @param {Object} opts 
 * @param {Number} opts.channel
 * @param {String} opts.mode
 */
  toggleRadioMode(opts) {
    if (opts.channel in Object.keys(this.active_radios)) {
      this.stationLog(`toggling ${opts.mode} mode on channel ${opts.channel}`)
      let radio = this.active_radios[opts.channel]
      this.config.toggleRadioMode({
        channel: opts.channel,
        cmd: radio.preset_commands[opts.mode]
      })
      radio.issuePresetCommand(opts.mode)
    } else {
      this.stationLog(`invalid radio channel ${opts.channel}`)
    }
  }

  /**
 * 
 * @param {Object} opts 
 * @param {Number} opts.receiver_channel
 * @param {Number} opts.blu_radio_channel
 * @param {Number} opts.poll_interval
 * @param {String} opts.radio_state
 */
  async toggleBluState(opts) {
    await this.config.toggleBluRadio({
      receiver_channel: opts.receiver_channel,
      poll_interval: opts.poll_interval,
      blu_radio_channel: opts.blu_radio_channel,
      radio_state: opts.radio_state,
    })
  }

  /**
   * 
   * @returns {Object} key:value pairs of blu radio channels and their respective firmware number
   */
  getBluFirmware() {
    return Object.keys(this.blu_fw_checkin)
      .map((channel) => ({
        channel: channel,
        version: this.blu_fw_checkin[channel],
      }))
  }

  /**
 * 
 * @param  {...any} msgs wrapper for data logger
 */
  stationLog(...msgs) {
    this.data_manager.log(msgs)
  }

  /**
 * start web socket server
 */
  startBluWebsocketServer() {

    this.sensor_socket_server.on('cmd', async (cmd) => {
      switch (cmd.cmd) {
        case ('blu_radio_all_on'):
          await this.bluRadiosAllOn(cmd)
          // let on_receiver = this.blu_receivers.find(receiver => receiver.port == Number(cmd.data.port))
          let on_receiver = this.findBluReceiver(cmd)
          await this.setBluReceiverState(on_receiver)
          break;
        case ('blu_radio_all_off'):
          await this.bluRadiosAllOff(cmd)
          let off_receiver = this.findBluReceiver(cmd)
          await this.setBluReceiverState(off_receiver)
          break
        case ('blu_led_all'):
          await this.bluRadiosAllLed(cmd)
          let led_receiver = this.findBluReceiver(cmd)
          await this.setBluReceiverState(led_receiver)
          break
        case ('blu_reboot_all'):
          await this.bluRadiosAllReboot(cmd)
          let reboot_receiver = this.findBluReceiver(cmd)
          await this.setBluReceiverState(reboot_receiver)
          break
        case ('all_change_poll'):
          await this.bluRadiosAllChangePoll(cmd)
          let poll_receiver = this.findBluReceiver(cmd)
          this.setBluReceiverState(poll_receiver)
          break
        case ('toggle_blu'):
          if (cmd.data.type === 'blu_on') {
            let blu_on = await this.bluRadioOn(cmd)
            await this.setBluRadioState(blu_on)
          } else if (cmd.data.type === "blu_off") {
            let blu_off = await this.bluRadioOff(cmd)
            await this.setBluRadioState(blu_off)
          }
          break
        case ('toggle_blu_led'):
          this.bluLed(cmd)
          break
        case ('reboot_blu_radio'):
          let blu_reboot = await this.bluReboot(cmd)
          await this.setBluRadioState(blu_reboot)
          break
        case ('change_poll'):
          let blu_poll = await this.bluChangePoll(cmd)
          await this.setBluRadioState(blu_poll)
          break
        case ('update-blu-firmware'):
          await this.updateBluRadio(cmd)
          break
        default:
          break
      }
    })
    this.sensor_socket_server.on('client_conn', (ip) => {
      this.stationLog(`client connected from IP: ${ip}`)
    })
  }

  /**
   * 
   * @param {String} path Radio path from chokidar, already substringed 17 spaces 
   */
  async startBluRadios(path) {
    const blu_path = this.blu_paths.find(receiver => receiver.path === path)
    this.blu_receivers.push(
      new BluReceiverManager({
        path: path,
        port: blu_path.channel,
        blu_radios: blu_path.blu_radios,
      })
    )

    const blu_receiver = this.blu_receivers.find(receiver => receiver.path === path)

    // Blu Event Emitter
    blu_receiver.on('complete', async (job) => {
      const { task, error, radio_channel, data } = job

      if (error && blu_receiver.port) {

        this.stationLog(`error ${error} on radio ${radio_channel} on USB Port ${blu_receiver.port}`)
        console.log(`error ${error} on radio ${radio_channel} on USB Port ${blu_receiver.port}`)

      }

      switch (task) {
        case BluReceiverTask.VERSION:

          this.blu_fw = {
            msg_type: 'blu-firmware',
            firmware: {
              [blu_receiver.port]: {
                channels: {
                  [radio_channel]: data.version,
                }
              }
            }
          }
          this.blu_fw_checkin[radio_channel] = data.version
          this.blu_version = data.version
          this.broadcast(JSON.stringify(this.blu_fw))

          break
        case BluReceiverTask.DETECTIONS:
          try {
            job.data.forEach((beep) => {
              const { id, rssi, time, channel: radio_channel, payload: { parsed: { solar, temp, } }, } = beep

              beep.data = id
              beep.meta = { data_type: 'blu_tag', rssi: rssi, }
              beep.msg_type = "blu"
              beep.protocol = "1.0.0"
              beep.received_at = moment(new Date(time)).utc()
              let radio = blu_receiver.blu_radios.find(radio =>
                radio.radio == radio_channel
              )
              beep.poll_interval = radio.poll_interval
              beep.port = blu_receiver.port
              beep.vcc = solar
              beep.temp = temp
              this.broadcast(JSON.stringify(beep))
              this.data_manager.handleBluBeep(beep)
              let blu_beep_sum = this.data_manager.stats.blu_stats.blu_ports[beep.port.toString()].channels[beep.channel.toString()].beeps
              let blu_sum = {
                port: blu_receiver.port,
                channel: radio_channel,
                blu_beeps: blu_beep_sum,

                msg_type: "blu_stats",
              }
              this.broadcast(JSON.stringify(blu_sum))
            })
            await blu_receiver.getBluVersion(job.radio_channel)


          } catch (e) {
            console.error(`base station get detections error on Port ${blu_receiver.port}`, e)
          }
          break
        case BluReceiverTask.DFU:
          // dfu download completed and then triggers reboot
          console.log(`BluReceiverTask.DFU ${radio_channel},  ${JSON.stringify(job)}`)
          break
        case BluReceiverTask.REBOOT:
          console.log(`BluReceiverTask.REBOOT ${JSON.stringify(job)}`)
          console.log('Blu Receiver is rebooting!', radio_channel)
          break
        case BluReceiverTask.LEDS:
          if (job.error == 'timeout') {
            // blu_receiver.setBluConfig(job.radio_channel, { scan: 0, rx_blink: 0 })
          }
          break
        case BluReceiverTask.CONFIG:
          break
        case BluReceiverTask.STATS:
          try {

            let port_key = blu_receiver.port.toString()
            let channel_key = job.radio_channel.toString()

            this.data_manager.handleBluDroppedDetections(
              {
                port: port_key,
                radio_channel: channel_key,
                dropped_detections: job.data.det_dropped,
              })

            let blu_dropped = this.data_manager.stats.blu_stats.blu_ports[port_key].channels[channel_key].blu_dropped
            let blu_stats = {
              port: blu_receiver.port,
              channel: job.radio_channel,
              blu_dropped: blu_dropped,
              msg_type: "blu_dropped",
            }

            this.broadcast(JSON.stringify(blu_stats))
          } catch (e) {
            console.log('blu station stats error:', 'receiver', blu_receiver.port, 'radio', job.radio_channel, e)
          }
          break
        default:
          break
      }
    })

    blu_receiver.startUpFlashLogo()

    const radios_start = await Promise.all(blu_receiver.blu_radios
      .map(async (radio) => {
        const { radio: radio_channel, poll_interval } = radio

        await blu_receiver.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })

        let blu_add = {
          port: blu_receiver.port,
          msg_type: "add_port",
        }
        this.broadcast(JSON.stringify(blu_add))

        radio.beeps = await blu_receiver.getDetections(radio_channel, poll_interval)
        radio.dropped = await blu_receiver.getBluStats(radio_channel, poll_interval)

      })).then((values) => {
        console.log('radios started values', values)
        return values
      }).catch((e) => {
        console.error('radios could not start properly', e)
      })

    blu_receiver.on('close', async () => {
      await this.stopBluRadios(receiver.path)
      await this.destroy_receiver(blu_receiver)
    })
  }

  /**
   * @param {String} path Full path, not subsetted
   */
  async stopBluRadios(path) {
    if (path !== undefined) {
      const blu_receiver = this.blu_receivers.find(receiver => receiver.path === path)
      const exit_promises = blu_receiver.blu_radios
        .map(async (radio) => {
          await blu_receiver.setBluConfig(radio.radio, { scan: 0, rx_blink: 0 })
          radio.beeps = await blu_receiver.stopDetections(radio)
          radio.dropped = await blu_receiver.stopStats(radio)
        })

      try {
        const radios_exit = await Promise.all(exit_promises)
      } catch (e) {
        console.error('radios exit error', e)
        radios_exit()
      }
    } else {
      console.log('no path to clear')
    }
  }

  /**
   * 
   * @param {Object} receiver BluReceiver with timeout events
   */
  async destroy_receiver(receiver) {
    await this.stopBluRadios(receiver.path)
    setTimeout(() => {

      delete receiver.path
      receiver.destroyed_port = receiver.port
      delete receiver.blu_radios
      delete receiver.port
    }, 5000)
  }


  async destroy_station() {
    try {
      delete this.firmware
      delete this.blu_fw
      delete this.blu_paths
      delete this.blu_receivers
      delete this.data_manager
      delete this.broadcast
      delete this.sensor_socket_server
      delete this.path
    } catch (e) {
      console.error('problem with destroying blustation')
    }
  }

  /**
   * 
   * @param {String} port 
   * @returns {Number} index number
   */
  findBluPort(port) {
    let index = this.blu_receivers.findIndex(receiver => receiver.port === Number(port))
    return index
  }

  /**
   * 
   * @param {String} path 
   * @returns {Number} index number
   */
  findBluIndex(path) {
    let index = this.blu_receivers.findIndex(receiver => receiver.path === path.substring(17))
    // console.log('findBluPath index', index)
    return index
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   * @param {Object} cmd.data
   * @param {Number} cmd.data.port usb port number
   * @returns {Object} returns found blu receiver
   */
  findBluReceiver(cmd) {
    let { data: { port }
    } = cmd
    const receiver = this.blu_receivers.find(receiver => receiver.port === Number(port))

    return receiver
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   * @param {Object} cmd.data
   * @param {Number} cmd.data.port usb port number
   * @param {Number} cmd.data.channel radio channel
   * @param {Number} cmd.data.poll_interval poll inteval
   * @returns {Object} returns found blu receiver
   */

  findBluReceiverAndRadio(cmd) {
    let { data: { port, channel, poll_interval }
    } = cmd
    let receiver = this.blu_receivers.find(receiver => receiver.port === Number(port))
    let radio = receiver.blu_radios.find(radio => radio.radio === Number(channel))
    radio.poll_interval = poll_interval ? poll_interval : radio.poll_interval

    return { receiver, radio }
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   * @param {Object} cmd.data
   * @param {Number} cmd.data.port usb port number
   * @param {Number} cmd.data.channel radio channel
   * @param {Number} cmd.data.poll_interval poll inteval
   * @returns {Number} returns index for found blu receiver
   * @returns {Number} returns index for found blu radio
   */
  findBluReceiverAndRadioIndex(cmd) {
    let { data: { port, channel, poll_interval }
    } = cmd
    let receiver_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(port))
    let radio_index = this.blu_receivers[receiver_index].blu_radios.findIndex(radio => radio.radio === Number(channel))
    this.blu_receivers[receiver_index].blu_radios[radio_index].poll_interval = poll_interval ? poll_interval : this.blu_receivers[receiver_index].blu_radios[radio_index].poll_interval

    return { receiver_index, radio_index }
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   * @param {Number} cmd.data.poll_interval poll inteval
   */
  async bluRadiosAllOn(cmd) {
    let all_on = this.findBluReceiver(cmd)
    const { data: { poll_interval: incoming_poll } } = cmd

    const radios_on = await Promise.all(all_on.blu_radios.map(async (radio) => {

      if (radio.beeps._destroyed == true) {
        radio.poll_interval = Number(incoming_poll)
        let radio_channel = radio.radio

        await all_on.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })

        radio.beeps = await all_on.getDetections(radio_channel, radio.poll_interval)
        radio.dropped = await all_on.getBluStats(radio_channel, radio.poll_interval)
        radio.radio_state = 1

      } else {
        radio.beeps = radio.beeps
        radio.dropped = radio.dropped
        radio.radio_state = 1
      }
    })).then((values) => {
      console.log('all radios on', values)
    }).catch((e) => {
      console.error('all radios on error', e)
    })
    return radios_on
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   */
  async bluRadiosAllOff(cmd) {
    let all_off = this.findBluReceiver(cmd)
    const radios_off = await Promise.all(all_off.blu_radios.map(async (radio) => {
      let radio_channel = radio.radio
      await all_off.setBluConfig(radio_channel, { scan: 0, rx_blink: 0, })

      radio.beeps = await all_off.stopDetections(radio)
      radio.dropped = await all_off.stopStats(radio)
      radio.radio_state = 0

    })).then((values) => {
      console.log('turning blu radio off', values)
    }).catch((e) => {
      console.error('all radios off error', e)
    })
    return radios_off
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   * @param {Boolean} cmd.data.scan scan value, 1 is scanning, 0 is off
   * @param {Boolean} cmd.data.rx_blink blink value, 1 is blink, 0 is off
   */
  async bluRadiosAllLed(cmd) {
    let all_led_receiver = this.findBluReceiver(cmd)
    const all_leds = Promise.all(all_led_receiver.blu_radios.map(async (radio) => {
      return await all_led_receiver.setBluConfig(Number(radio.radio), { scan: cmd.data.scan, rx_blink: cmd.data.rx_blink, })
    })).then((values) => {
      console.log('turning radio leds on', values)

    }).catch((e) => {
      console.log('cannot turn radio leds on', e)
    })
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   * @param {Number} cmd.data.port blu receiver port number
   */
  async bluRadiosAllReboot(cmd) {

    let all_reboot_receiver = this.findBluReceiver(cmd)

    const all_reboot = Promise.all(all_reboot_receiver.blu_radios.map(async (radio) => {

      radio.beeps = await all_reboot_receiver.stopDetections(radio)
      radio.dropped = await all_reboot_receiver.stopStats(radio)

      // reset polling interval to 10 s on reboot
      let radio_channel = radio.radio
      radio.poll_interval = 10000

      let poll_data = {
        port: all_reboot_receiver.port,
        channel: radio_channel,
        poll_interval: radio.poll_interval,
        msg_type: 'poll_interval',
      }

      this.broadcast(JSON.stringify(poll_data))

      all_reboot_receiver.rebootBluRadio(radio_channel)
        .then((values) => {
          console.log('radio reboot values', values)
        })
        .catch((e) => {
          console.error(console.error('could not reboot radio', e))
        })

      // await all_reboot_receiver.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
      setTimeout(async () => {
        radio.beeps = await all_reboot_receiver.getDetections(radio_channel, Number(cmd.data.poll_interval))
        radio.dropped = await all_reboot_receiver.getBluStats(radio_channel, Number(cmd.data.poll_interval))
      }, 10000)


    })).then((values) => {
      console.log('all radios rebooting', values)
      return values
    }).catch((e) => {
      console.error('all radios reboot error', e)
    })
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   * @param {Number} cmd.data.port blu receiver port number
   */
  async bluRadiosAllChangePoll(cmd) {
    let all_poll_receiver = this.findBluReceiver(cmd)
    const all_poll = Promise.all(all_poll_receiver.blu_radios.map(async (radio) => {

      radio.beeps = await all_poll_receiver.stopDetections(radio)
      radio.dropped = await all_poll_receiver.stopStats(radio)

      let radio_channel = radio.radio
      radio.poll_interval = Number(cmd.data.poll_interval)
      let poll_data = {
        port: all_poll_receiver.port,
        channel: radio_channel,
        poll_interval: Number(cmd.data.poll_interval),
        msg_type: 'poll_interval',
      }
      this.broadcast(JSON.stringify(poll_data))

      // await all_poll_receiver.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })

      radio.beeps = await all_poll_receiver.getDetections(radio_channel, Number(cmd.data.poll_interval))
      radio.dropped = await all_poll_receiver.getBluStats(radio_channel, Number(cmd.data.poll_interval))


    })).then((values) => {
      console.log('all radios poll intervals changed', values)
    }).catch((e) => {
      // console.error(e)
      console.error('all radios poll interval change error', e)
    })

    return all_poll
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   */
  async bluRadioOn(cmd) {
    let on = this.findBluReceiverAndRadio(cmd)
    let { receiver, radio } = on
    let radio_channel = radio.radio
    radio.poll_interval = Number(cmd.data.poll_interval)
    await receiver.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })

    radio.beeps = await receiver.getDetections(radio_channel, radio.poll_interval)
    radio.dropped = await receiver.getBluStats(radio_channel, radio.poll_interval)
    radio.radio_state = 1

    return { receiver, radio, poll_interval: radio.poll_interval, state: radio.radio_state }
  }

  /**
   * 
   * @param {Object} cmd websocket command object
   */
  async bluRadioOff(cmd) {
    let off = this.findBluReceiverAndRadio(cmd)
    let { receiver, radio } = off
    let radio_channel = radio.radio
    receiver.setBluConfig(radio_channel, { scan: 0, rx_blink: 0, })
    radio.beeps = await receiver.stopDetections(radio)
    radio.dropped = await receiver.stopStats(radio)
    radio.radio_state = 0
    return { receiver, radio, poll_interval: radio.poll_interval, state: radio.radio_state }

  }

  /**
   * 
   * @param {Object} cmd websocket command object
   * @param {Object} cmd.data
   * @param {Boolean} cmd.data.scan scan value, 1 is scanning, 0 is off
   * @param {Boolean} cmd.data.rx_blink blink value, 1 is on, 0 is off
   */
  bluLed(cmd) {
    let { data: { scan, rx_blink } } = cmd
    let led = this.findBluReceiverAndRadio(cmd)
    led.receiver.setBluConfig(led.radio.radio, { scan, rx_blink })
  }

  /**
 * 
 * @param {Object} cmd websocket command object
 */
  async bluReboot(cmd) {
    try {

      let { receiver, radio } = this.findBluReceiverAndRadio(cmd)

      let radio_channel = radio.radio
      let poll_interval = 10000

      this.poll_data = {
        channel: radio_channel,
        poll_interval: poll_interval,
        msg_type: 'poll_interval',
      }
      this.broadcast(JSON.stringify(this.poll_data))

      radio.beeps = await receiver.stopDetections(radio)
      radio.dropped = await receiver.stopStats(radio)

      // await receiver.rebootBluRadio(radio)
      receiver.rebootBluRadio(radio_channel)
        .then((values) => {
          console.log('radio reboot values', values)
        })
        .catch((e) => {
          console.error(console.error('could not reboot radio', e))
        })

      setTimeout(async () => {
        radio.beeps = await receiver.getDetections(radio_channel, poll_interval)
        radio.dropped = await receiver.getBluStats(radio_channel, poll_interval)
      }, 10000)

      radio.poll_interval = poll_interval

      return { receiver, radio, poll_interval: radio.poll_interval, state: radio.radio_state }

    } catch (e) {
      console.error(`Could not reboot radio ${radio_channel} on USB Port ${receiver.port}`)
    }
  }
  /**
* 
* @param {Object} cmd websocket command object
*/
  async bluChangePoll(cmd) {

    let { receiver, radio } = this.findBluReceiverAndRadio(cmd)
    let radio_channel = radio.radio
    let poll_interval = cmd.data.poll_interval

    let poll_data = {
      channel: radio_channel,
      poll_interval: poll_interval,
      msg_type: "poll_interval",
    }
    this.broadcast(JSON.stringify(poll_data))
    radio.beeps = await receiver.stopDetections(radio)
    radio.dropped = await receiver.stopStats(radio)

    radio.beeps = await receiver.getDetections(radio_channel, poll_interval)
    radio.dropped = await receiver.getBluStats(radio_channel, poll_interval)

    return { receiver, radio, poll_interval: radio.poll_interval, state: radio.radio_state }
  }

  /**
* 
* @param {Object} cmd websocket command object
*/
  async updateBluRadio(cmd) {

    let { receiver, radio } = this.findBluReceiverAndRadio(cmd)
    let radio_channel = radio.radio
    let poll_interval = cmd.data.poll_interval

    let poll_data = {
      channel: radio_channel,
      poll_interval: poll_interval,
      msg_type: "poll_interval",
    }

    await receiver.updateBluFirmware(radio)

  }

  /**
  * @param {Object} receiver BluReceiver object
  * @param {String} receiver.port Port number in string format
  */
  async setBluReceiverState(receiver) {

    let receiver_channel = receiver.port

    receiver.blu_radios.forEach(async (radio) => {
      let blu_radio_channel = radio.radio
      let poll_interval = radio.poll_interval
      let radio_state = radio.radio_state
      await this.toggleBluState({ receiver_channel, blu_radio_channel, poll_interval, radio_state })
    })
  }

  /**
 * @param {Object} opts Websocket command object
 * @param {Object} opts.receiver BluReceiver Object
 * @param {String} opts.radio Radio Object on the receiver
 */
  async setBluRadioState(opts) {
    let { receiver, radio } = opts

    let receiver_channel = receiver.port
    let blu_radio_channel = radio.radio

    if (opts.poll_interval) {
      let poll_interval = Number(opts.poll_interval)
      let radio_state = opts.scan ? Number(opts.state) : 1
      await this.toggleBluState({ receiver_channel, blu_radio_channel, poll_interval, radio_state })
    } else {
      let radio_state = opts.scan ? Number(opts.state) : 1
      await this.toggleBluState({ receiver_channel, blu_radio_channel, radio_state })
    }
  }
}

export default BluStation
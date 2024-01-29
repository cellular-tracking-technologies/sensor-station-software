import Leds from '../../hardware/bluseries-receiver/driver/leds.js'
// import { BluReceiver, BluReceiverTask } from '../../hardware/bluseries-receiver/blu-receiver.js'
import { BluReceiverTask } from '../../hardware/bluseries-receiver/blu-receiver.js'
import BluReceiverManager from '../../hardware/bluseries-receiver/blu-receiver-manager.js'
import fs from 'fs'
import moment from 'moment'

// class BluStation extends BluReceiver {
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
  }

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

  bluInit(path) {
    this.startBluRadios(path)
  }

  /**
   * 
   * @param {String} path Radio path from chokidar, already substringed 17 spaces 
   */
  startBluRadios(path) {
    let blu_path = this.blu_paths.find(receiver => receiver.path === path)
    let blu_receiver = new BluReceiverManager({
      path: path,
      port: blu_path.channel,
      blu_radios: blu_path.blu_radios,
    })
    this.blu_receivers.push(blu_receiver)

    let br_index = this.blu_receivers.findIndex(receiver => receiver.path === path)
    blu_receiver = undefined

    setTimeout(() => {}, 5000)
    
    this.blu_receivers[br_index].on('complete', (job) => {

      switch (job.task) {
        case BluReceiverTask.VERSION:
          try {
            console.log(`BluReceiverTask.VERSION Port ${this.blu_receivers[br_index].port} ${JSON.stringify(job)}`)

            this.blu_fw = {
              msg_type: 'blu-firmware',
              firmware: {
                [this.blu_receivers[br_index].port]: {
                  channels: {
                    [job.radio_channel]: job.data.version,
                  }
                }
              }
            }

            this.blu_fw_checkin[job.radio_channel] = job.data.version
            this.broadcast(JSON.stringify(this.blu_fw))
          } catch (e) {
            console.error('basestation getBluVersion error:', e)
          }
          break
        case BluReceiverTask.DETECTIONS:
          try {
            console.log(`BluReceiverTask.DETECT Port ${this.blu_receivers[br_index].port} radio ${job.radio_channel} has ${job.data.length} detections`)
            job.data.forEach((beep) => {
              beep.data = { id: beep.id }
              beep.meta = { data_type: "blu_tag", rssi: beep.rssi, }
              beep.msg_type = "blu"
              beep.protocol = "1.0.0"
              beep.received_at = moment(new Date(beep.time)).utc()
              beep.radio_index = this.blu_receivers[br_index].blu_radios.findIndex(radio =>
                radio.radio == beep.channel
              )
              beep.poll_interval = this.blu_receivers[br_index].blu_radios[beep.radio_index].poll_interval
              beep.port = this.blu_receivers[br_index].port
              beep.vcc = beep.payload.parsed.solar
              beep.temp = beep.payload.parsed.temp
              this.broadcast(JSON.stringify(beep))
              this.data_manager.handleBluBeep(beep)
              let blu_beep_sum = this.data_manager.stats.blu_stats.blu_ports[beep.port.toString()].channels[beep.channel.toString()].beeps
              // console.log('beep stat manager blu stats', this.data_manager.stats.blu_stats.blu_ports[beep.port.toString()].channels[beep.channel.toString()].beeps)
              let blu_sum = {
                port: this.blu_receivers[br_index].port,
                channel: job.radio_channel,
                // blu_beeps: job.data.length == null ? 0 : job.data.length,
                blu_beeps: blu_beep_sum,

                msg_type: "blu_stats",
              }
              this.broadcast(JSON.stringify(blu_sum))

            })

          } catch (e) {
            console.error(`base station get detections error on Port ${this.blu_receivers[br_index].port}`, e)
          }
          break
        case BluReceiverTask.DFU:
          // dfu download completed and then triggers reboot
          console.log(`BluReceiverTask.DFU ${this.blu_receivers[br_index].channel},  ${JSON.stringify(job)}`)
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
          try {

            let port_key = this.blu_receivers[br_index].port.toString()
            let channel_key = job.radio_channel.toString()

            this.data_manager.handleBluDroppedDetections(
              {
                port: port_key,
                radio_channel: channel_key,
                dropped_detections: job.data.det_dropped,
              })


            let blu_dropped = this.data_manager.stats.blu_stats.blu_ports[port_key].channels[channel_key].blu_dropped
            let blu_stats = {
              port: this.blu_receivers[br_index].port,
              channel: job.radio_channel,
              blu_dropped: blu_dropped,
              msg_type: "blu_dropped",
            }
            console.log(`BluReceiverTask.STATS  Port ${this.blu_receivers[br_index].port} radio ${job.radio_channel} has ${blu_stats.blu_dropped} detections dropped`)

            this.broadcast(JSON.stringify(blu_stats))
          } catch (e) {
            console.log('base station stats error:', 'receiver', this.blu_receivers[br_index].port, 'radio', job.radio_channel, e)
          }
          break
        default:
          break
      }
    })

    this.blu_receivers[br_index].startUpFlashLogo()

    this.sendBluVersion(this.blu_receivers[br_index], 10000)

    const radios_start = Promise.all(this.blu_receivers[br_index].blu_radios
      .map((radio) => {
        let radio_channel = radio.radio
        let poll_interval = radio.poll_interval
        this.blu_receivers[br_index].setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
        let blu_add = {
          port: this.blu_receivers[br_index].port,

          msg_type: "add_port",
        }

        radio.beeps = this.blu_receivers[br_index].getDetections(radio_channel, poll_interval)
          .then((values) => { return values })
        radio.dropped = this.blu_receivers[br_index].getBluStats(radio_channel, poll_interval)
          .then((values) => { return values })
      })).then((values) => {
        console.log('radios started values', values)
        return values
      }).catch((e) => {
        console.error('radios could not start properly', e)
      })


    this.blu_receivers[br_index].on('close', () => {
      this.destroy_station()
    })
  }

  stopBluRadios(path) {
    if (path !== undefined) {
      let br_index = this.blu_receivers.findIndex(receiver => receiver.path === path)

      const exit_promises = this.blu_receivers[br_index].blu_radios
        .map((radio) => {
          this.blu_receivers[br_index].radioOff(radio)
        })

      try {
        const radios_exit = Promise.all(exit_promises)
      } catch (e) {
        console.error('radios exit error', e)
        radios_exit()
      }
    } else {
      console.log('no path to clear')
    }
  }

  sendBluVersion(receiver, poll_interval) {
    setInterval(() => {
      receiver.getBluVersion(1)
      receiver.getBluVersion(2)
      receiver.getBluVersion(3)
      receiver.getBluVersion(4)
      let blu_add = {
        port: receiver.port,

        msg_type: "add_port",
      }
      this.broadcast(JSON.stringify(blu_add))
    }, poll_interval)
  }

  destroy_receiver(receiver) {
    delete receiver.path
    receiver.destroyed_port = receiver.port
    delete receiver.blu_radios
    delete receiver.port
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
   * @returns 
   */
  findBluPort(port) {
    let index = this.blu_receivers.findIndex(receiver => receiver.port === Number(port))
    return index
  }

  /**
   * 
   * @param {String} path 
   * @returns 
   */
  findBluIndex(path) {
    let index = this.blu_receivers.findIndex(receiver => receiver.path === path.substring(17))
    // console.log('findBluPath index', index)
    return index
  }


  findBluReceiver(cmd) {
    let { data: { port }
    } = cmd
    // console.log('find blu station only cmd', cmd)
    let receiver = this.blu_receivers.find(receiver => receiver.port === Number(port))
    console.log('find blu receiver', receiver)

    return receiver
  }

  findBluReceiverAndRadio(cmd) {
    let { data: { port, channel, poll_interval }
    } = cmd
    let receiver = this.blu_receivers.find(receiver => receiver.port === Number(port))
    let radio = receiver.blu_radios.find(radio => radio.radio === Number(channel))
    radio.poll_interval = poll_interval ? poll_interval : radio.poll_interval

    return { receiver, radio }
  }

  findBluReceiverAndRadioIndex(cmd) {
    let { data: { port, channel, poll_interval }
    } = cmd
    let receiver_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(port))
    let radio_index = this.blu_receivers[receiver_index].blu_radios.findIndex(radio => radio.radio === Number(channel))
    this.blu_receivers[receiver_index].blu_radios[radio_index].poll_interval = poll_interval ? poll_interval : this.blu_receivers[receiver_index].blu_radios[radio_index].poll_interval

    return { receiver_index, radio_index }
  }

  bluRadiosAllOn(cmd) {
    // let on_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(cmd.data.port))
    let all_on = this.findBluReceiver(cmd)

    // console.log('blu radios all on', all_on)

    const radios_on = Promise.all(all_on.blu_radios.map(radio => {

      radio.poll_interval = Number(cmd.data.poll_interval)
      let poll_interval = radio.poll_interval
      let radio_channel = radio.radio
      all_on.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })

      radio.beeps = all_on.getDetections(radio_channel, poll_interval)
        .then((values) => { console.log('get detection values', values); return values })
        .catch((e) => { console.error('get detections could not start', e) })
      radio.dropped = all_on.getBluStats(radio_channel, poll_interval)
        .then((values) => { console.log('get detection values', values); return values })
        .catch((e) => { console.error('get stats could not start', e) })
    })).then((values) => {
      console.log('all radios on', values)
    }).catch((e) => {
      console.error('all radios on error', e)
    })
  }

  bluRadiosAllOff(cmd) {
    // let off_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(cmd.data.port))
    let all_off = this.findBluReceiver(cmd)
    const radios_off = Promise.all(all_off.blu_radios.map(radio => {
      let radio_channel = radio.radio
      all_off.setBluConfig(radio_channel, { scan: 0, rx_blink: 0, })

      radio.beeps = all_off.stopDetections(radio)
        .then((values) => { console.log('stop detection values', values); return values })
        .catch((e) => { console.error('could not stop detections', e) })
      radio.dropped = all_off.stopStats(radio)
        .then((values) => { console.log('stop stats values', values); return values })
        .catch((e) => { console.error('could not stop stats', e) })
    })).then((values) => {
      console.log('turning blu radio off', values)
    }).catch((e) => {
      console.error('all radios off error', e)
    })
  }

  bluRadiosAllLed(cmd) {
    let all_led_receiver = this.findBluReceiver(cmd)
    const all_leds = Promise.all(all_led_receiver.blu_radios.map(radio => {
      all_led_receiver.setBluConfig(Number(radio.radio), { scan: cmd.data.scan, rx_blink: cmd.data.rx_blink, })
    })).then((values) => {
      console.log('turning radio leds on', values)
    }).catch((e) => {
      console.log('cannot turn radio leds on', e)
    })
  }

  bluRadiosAllReboot(cmd) {

    let reboot_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(cmd.data.port))

    const all_reboot = Promise.all(this.blu_receivers[reboot_index].blu_radios.map(radio => {
      radio.beeps = this.blu_receivers[reboot_index].stopDetections(radio)
        .then((values) => { console.log('stop detection values', values); return values })
        .catch((e) => { console.error('could not stop detections', e) })
      radio.dropped = this.blu_receivers[reboot_index].stopStats(radio)
        .then((values) => { console.log('stop stats values', values); return values })
        .catch((e) => { console.error('could not stop stats', e) })

      // reset polling interval to 10 s on reboot
      let radio_channel = radio.radio
      radio.poll_interval = 10000

      let poll_data = {
        port: this.blu_receivers[reboot_index].port,
        channel: radio_channel,
        poll_interval: radio.poll_interval,
        msg_type: 'poll_interval',
      }

      this.broadcast(JSON.stringify(poll_data))
      this.blu_receivers[reboot_index].rebootBluRadio(radio_channel)
        .then((values) => {
          console.log('radio reboot values', values)
        })
        .catch((e) => {
          console.error(console.error('could not reboot radio', e))
        })
      this.blu_receivers[reboot_index].setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
      radio.beeps = this.blu_receivers[reboot_index].getDetections(radio_channel, Number(cmd.data.poll_interval))
        .then((values) => { console.log('get detection values', values); return values })
        .catch((e) => { console.error('get detections could not start', e) })
      radio.dropped = this.blu_receivers[reboot_index].getBluStats(radio_channel, Number(cmd.data.poll_interval))
        .then((values) => { console.log('get detection values', values); return values })
        .catch((e) => { console.error('get stats could not start', e) })

    })).then((values) => {
      console.log('all radios rebooting', values)
      return values
    }).catch((e) => {
      console.error('all radios reboot error', e)
    })
  }

  bluRadiosAllChangePoll(cmd) {
    let poll_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(cmd.data.port))
    const all_poll = Promise.all(this.blu_receivers[poll_index].blu_radios.map(radio => {
      radio.beeps = this.blu_receivers[poll_index].stopDetections(radio)
        .then((values) => { console.log('stop detection values', values); return values })
        .catch((e) => { console.error('could not stop detections', e) })
      radio.dropped = this.blu_receivers[poll_index].stopStats(radio)
        .then((values) => { console.log('stop stats values', values); return values })
        .catch((e) => { console.error('could not stop stats', e) })

      let radio_channel = radio.radio
      radio.poll_interval = Number(cmd.data.poll_interval)
      let poll_data = {
        port: this.blu_receivers[poll_index].port,
        channel: radio_channel,
        poll_interval: Number(cmd.data.poll_interval),
        msg_type: 'poll_interval',
      }
      this.broadcast(JSON.stringify(poll_data))

      this.blu_receivers[poll_index].setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
      radio.beeps = this.blu_receivers[poll_index].getDetections(radio_channel, Number(cmd.data.poll_interval))
        .then((values) => { console.log('get detection values', values); return values })
        .catch((e) => { console.error('get detections could not start', e) })
      radio.dropped = this.blu_receivers[poll_index].getBluStats(radio_channel, Number(cmd.data.poll_interval))
        .then((values) => { console.log('get detection values', values); return values })
        .catch((e) => { console.error('get stats could not start', e) })

    })).then((values) => {
      console.log('all radios poll intervals changed', values)
    }).catch((e) => {
      // console.error(e)
      console.error('all radios poll interval change error', e)
    })
  }

  bluRadioOn(cmd) {
    let on = this.findBluReceiverAndRadio(cmd)
    let { receiver, radio } = on
    let radio_channel = radio.radio
    radio.poll_interval = Number(cmd.data.poll_interval)
    receiver.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })

    radio.beeps = receiver.getDetections(radio_channel, radio.poll_interval)
      .then((values) => { console.log('stop detection values', values); return values })
      .catch((e) => { console.error('could not stop detections', e) })
    radio.dropped = receiver.getBluStats(radio_channel, radio.poll_interval)
      .then((values) => { console.log('stop stats values', values); return values })
      .catch((e) => { console.error('could not stop stats', e) })
    // on.receiver.radioOn(on.radio, on.radio.poll_interval)
  }

  bluRadioOff(cmd) {
    let off = this.findBluReceiverAndRadio(cmd)
    let { receiver, radio } = off
    let radio_channel = radio.radio
    receiver.setBluConfig(radio_channel, { scan: 0, rx_blink: 0, })
    radio.beeps = receiver.stopDetections(radio)
      .then((values) => { console.log('stop detection values', values); return values })
      .catch((e) => { console.error('could not stop detections', e) })
    radio.dropped = receiver.stopStats(radio)
      .then((values) => { console.log('stop stats values', values); return values })
      .catch((e) => { console.error('could not stop stats', e) })

    // off.receiver.radioOff(off.radio)
    //   .then((values) => {
    //     clearInterval(values.beeps)
    //     clearInterval(values.dropped)
    //   })
    //   .catch((e) => {
    //     console.error(console.error('could not turn radio off', e))
    //   })
  }

  bluLed(cmd) {
    let { data: { scan, rx_blink } } = cmd
    let led = this.findBluReceiverAndRadio(cmd)
    led.receiver.setBluConfig(led.radio.radio, { scan, rx_blink })
  }

  bluReboot(cmd) {
    let reboot = this.findBluReceiverAndRadio(cmd)
    let { receiver, radio } = reboot
    let radio_channel = radio.radio
    let reboot_interval = 10000

    this.poll_data = {
      channel: radio_channel,
      poll_interval: reboot_interval,
      msg_type: 'poll_interval',
    }
    this.broadcast(JSON.stringify(this.poll_data))
    radio.beeps = receiver.stopDetections(radio)
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not change poll on radio', e) })
    radio.dropped = receiver.stopStats(radio)
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not change poll on radio', e) })

    reboot.receiver.rebootBluRadio(radio, reboot_interval)
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not reboot radio', e) })

    radio.beeps = reboot.receiver.getDetections(radio_channel, reboot_interval)
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not turn on radio', e) })
    radio.dropped = reboot.receiver.getBluStats(radio_channel, reboot_interval)
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not turn on radio', e) })

    radio.poll_interval = reboot_interval
  }

  bluChangePoll(cmd) {

    let { receiver_index, radio_index } = this.findBluReceiverAndRadioIndex(cmd)
    let radio = this.blu_receivers[receiver_index].blu_radios[radio_index]

    let radio_channel = this.blu_receivers[receiver_index].blu_radios[radio_index].radio
    let poll_interval = cmd.data.poll_interval

    let poll_data = {
      channel: radio_channel,
      poll_interval: poll_interval,
      msg_type: "poll_interval",
    }
    radio.beeps = this.blu_receivers[receiver_index].stopDetections(this.blu_receivers[receiver_index].blu_radios[radio_index])
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not change poll on radio', e) })
    radio.dropped = this.blu_receivers[receiver_index].stopStats(this.blu_receivers[receiver_index].blu_radios[radio_index])
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not change poll on radio', e) })
    radio = this.blu_receivers[receiver_index].radioOn(radio, radio.poll_interval)
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not change poll on radio', e) })
  }
}

export default BluStation
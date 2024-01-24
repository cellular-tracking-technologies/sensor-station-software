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
  }

  bluServerBound() {
    this.bluStartWebSocketServer.bind(this)
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
    console.log('start receivers blu receiver', blu_path)

    let blu_receiver = new BluReceiverManager({
      path: path,
      port: blu_path.channel,
      blu_radios: blu_path.blu_radios,
    })
    this.blu_receivers.push(blu_receiver)

    let br_index = this.blu_receivers.findIndex(receiver => receiver.path === path)
    console.log('blu receivers array', this.blu_receivers, 'indexed blu receivers array', this.blu_receivers[br_index])

    // this.bluServerBound(this.blu_receivers[br_index])
    blu_receiver = undefined

    setTimeout(() => {

    }, 2000)

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
            this.broadcast(JSON.stringify(this.blu_fw))
          } catch (e) {
            console.error('basestation getBluVersion error:', e)
          }
          break
        case BluReceiverTask.DETECTIONS:
          try {
            console.log('Port', this.blu_receivers[br_index].port, 'radio', job.radio_channel, 'has', job.data.length, 'detections')
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
              this.data_manager.handleBluBeep(beep)
              beep.vcc = beep.payload.parsed.solar
              beep.temp = beep.payload.parsed.temp
              this.broadcast(JSON.stringify(beep))
            })
            let blu_sum = {
              port: this.blu_receivers[br_index].port,
              channel: job.radio_channel,
              blu_beeps: job.data.length == null ? 0 : job.data.length,
              msg_type: "blu_stats",
            }
            this.broadcast(JSON.stringify(blu_sum))
          } catch (e) {
            console.error(`base station get detections error on Port ${this.blu_receivers[br_index].port}`, e)
          }
          break
        case BluReceiverTask.DFU:
          // dfu download completed and then triggers reboot
          console.log(this.blu_receivers[br_index].channel, `BluReceiverTask.DFU ${JSON.stringify(job)}`)
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

            let blu_stats = {
              port: this.blu_receivers[br_index].port,
              channel: job.radio_channel,
              blu_dropped: job.data.det_dropped == null ? 0 : job.data.det_dropped,
              msg_type: "blu_dropped",
            }
            console.log('Port', this.blu_receivers[br_index].port, 'radio', job.radio_channel, 'has', blu_stats.blu_dropped, 'detections dropped')

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
        console.log('radios start radio', radio)
        let radio_channel = radio.radio
        let poll_interval = radio.poll_interval
        this.blu_receivers[br_index].setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })

        // radio = this.blu_receivers[br_index].radioOn({ radio: radio_channel, poll_interval }, poll_interval)
        //   .then((values) => { console.log('radios start radio values', values.radio); return values })
        //   .catch((e) => { console.log('radio did not turn on', e) })

        // console.log('blu radios start', radio)
        radio.beeps = this.blu_receivers[br_index].getDetections(radio_channel, poll_interval)
          .then((values) => { console.log('get detection values', values); return values })
        radio.dropped = this.blu_receivers[br_index].getBluStats(radio_channel, poll_interval)
          .then((values) => { console.log('get detection values', values); return values })
      })).then((values) => {
        console.log('radios started', this.blu_receivers[br_index].blu_radios)
        return values
      }).catch((e) => {
        console.error('radios could not start properly', e)
      })

    console.log('blu radios after radios start', this.blu_receivers[br_index].blu_radios)

    this.blu_receivers[br_index].on('close', () => {
      console.log('blu receiver closing within startBluRadios')
      this.destroy_station()
    })
  } // end of startBluRadios

  stopBluRadios(path) {
    if (path !== undefined) {
      let br_index = this.blu_receivers.findIndex(receiver => receiver.path === path)

      console.log('stop blu radios path', path)
      const exit_promises = this.blu_receivers[br_index].blu_radios
        .map((radio) => {
          this.blu_receivers[br_index].radioOff(radio)
        })

      try {
        const radios_exit = Promise.all(exit_promises)
        console.log('radios turning off', radios_exit)
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
      // this.destroyed_port = this.blu_receivers[br_index].channel
      delete this.path
      // delete this
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
    console.log('findBluPath index', index)
    return index
  }


  findBluReceiver(cmd) {
    let { data: { port }
    } = cmd
    console.log('find blu station only cmd', cmd)
    let receiver = this.blu_receivers.find(receiver => receiver.port === Number(port))

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
    // let all_on_receiver = this.findBluReceiver(cmd)
    let on_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(cmd.data.port))

    console.log('indexed blu receiver', this.blu_receivers[on_index].blu_radios)
    const radios_on = Promise.all(this.blu_receivers[on_index].blu_radios.map(radio => {
      radio.poll_interval = Number(cmd.data.poll_interval)
      radio = this.blu_receivers[on_index].radioOn(radio, radio.poll_interval)
        .then((values) => { console.log('blu radios all on values', values); return values })
        .catch((e) => { console.log('radio did not turn on', e) })
      // radio.beeps = this.blu_receivers[on_index].getDetections(radio.radio, radio.poll_interval)
      // radio.dropped = this.blu_receivers[on_index].getBluStats(radio.radio, radio.poll_interval)
      console.log('blu radio after radioOn', radio)
    })).then((values) => {
      console.log('all radios on', values)
    }).catch((e) => {
      console.error('all radios on error', e)
    })
  }

  bluRadiosAllOff(cmd) {
    let off_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(cmd.data.port))

    const radios_off = Promise.all(this.blu_receivers[off_index].blu_radios.map(radio => {
      console.log('radios off individual radio', radio)
      // radio = this.blu_receivers[off_index].radioOff(radio)
      let radio_off = this.blu_receivers[off_index].radioOff(radio).then((values) => {
        clearInterval(values.beeps)
        clearInterval(values.dropped)
        console.log('blu radios off value', values)
        return values
      })
        .catch((e) => { console.log('radio could not turn off', e) })
      // this.blu_receivers[off_index].setBluConfig(radio.radio, { scan: 0, rx_blink: 0, })
      // clearInterval(radio.beeps)
      // clearInterval(radio.dropped)
      // radio.beeps = undefined
      // radio.dropped = undefined

      console.log('blu radios all off radio', radio)
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
    console.log('blu reboot all cmd', cmd)

    // let all_reboot_receiver = this.findBluReceiver(cmd)
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
    // let all_change_poll = this.findBluReceiver(cmd)
    let poll_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(cmd.data.port))

    const all_poll = Promise.all(this.blu_receivers[poll_index].blu_radios.map(radio => {
      console.log('blu radios change poll radio', radio)

      radio.beeps = this.blu_receivers[poll_index].stopDetections(radio)
        .then((values) => { console.log('stop detection values', values); return values })
        .catch((e) => { console.error('could not stop detections', e) })
      radio.dropped = this.blu_receivers[poll_index].stopStats(radio)
        .then((values) => { console.log('stop stats values', values); return values })
        .catch((e) => { console.error('could not stop stats', e) })

      console.log('change poll radio after radio off', radio)

      let radio_channel = radio.radio
      radio.poll_interval = Number(cmd.data.poll_interval)
      let poll_data = {
        port: this.blu_receivers[poll_index].port,
        channel: radio_channel,
        poll_interval: Number(cmd.data.poll_interval),
        msg_type: 'poll_interval',
      }
      this.broadcast(JSON.stringify(poll_data))
      // radio = this.blu_receivers[poll_index].radioOff(radio).then((values) => {
      //   console.log('change poll radio off values', values)
      //   clearInterval(values.beeps)
      //   clearInterval(values.dropped)
      //   return values
      // })
      //   .catch((e) => {
      //     console.error('could not turn off radio', e)
      //   })
      // radio = this.blu_receivers[poll_index].radioOn({ radio: radio_channel, poll_interval: Number(cmd.data.poll_interval) }, Number(cmd.data.poll_interval))
      //   .then((values) => { console.log('radio on values', values); return values })
      //   .catch((e) => { console.log('radio did not turn on', e) })
      this.blu_receivers[poll_index].setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
      radio.beeps = this.blu_receivers[poll_index].getDetections(radio_channel, Number(cmd.data.poll_interval))
        .then((values) => { console.log('get detection values', values); return values })
        .catch((e) => { console.error('get detections could not start', e) })
      radio.dropped = this.blu_receivers[poll_index].getBluStats(radio_channel, Number(cmd.data.poll_interval))
        .then((values) => { console.log('get detection values', values); return values })
        .catch((e) => { console.error('get stats could not start', e) })

      console.log('change poll radio after radio on', radio)

    })).then((values) => {
      console.log('all radios poll intervals changed', values)
    }).catch((e) => {
      // console.error(e)
      console.error('all radios poll interval change error', e)
    })
  }

  bluRadioOn(cmd) {
    let on = this.findBluReceiverAndRadio(cmd)
    on.receiver.radioOn(on.radio, on.radio.poll_interval)
  }

  bluRadioOff(cmd) {
    let off = this.findBluReceiverAndRadio(cmd)

    off.receiver.radioOff(off.radio)
      .then((values) => {
        clearInterval(values.beeps)
        clearInterval(values.dropped)
      })
      .catch((e) => {
        console.error(console.error('could not turn radio off', e))
      })
  }

  bluLed(cmd) {
    let { data: { scan, rx_blink } } = cmd
    let led = this.findBluReceiverAndRadio(cmd)
    console.log('blu led ', led)
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
    // reboot.receiver.updateConfig(receiver, radio, reboot_interval)
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
    console.log('blu change poll cmd', cmd)
    // let poll = this.findBluReceiverAndRadio(cmd)
    // let { receiver, radio } = poll
    let { receiver_index, radio_index } = this.findBluReceiverAndRadioIndex(cmd)
    // let radio_channel = radio.radio
    let radio = this.blu_receivers[receiver_index].blu_radios[radio_index]

    let radio_channel = this.blu_receivers[receiver_index].blu_radios[radio_index].radio
    let poll_interval = cmd.data.poll_interval

    let poll_data = {
      channel: radio_channel,
      poll_interval: poll_interval,
      msg_type: "poll_interval",
    }
    // poll.receiver.radioOff(radio)
    radio.beeps = this.blu_receivers[receiver_index].stopDetections(this.blu_receivers[receiver_index].blu_radios[radio_index])
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not change poll on radio', e) })
    radio.dropped = this.blu_receivers[receiver_index].stopStats(this.blu_receivers[receiver_index].blu_radios[radio_index])
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not change poll on radio', e) })
    radio = this.blu_receivers[receiver_index].radioOn(radio, radio.poll_interval)
      .then((values) => { console.log(values); return values })
      .catch((e) => { console.error('could not change poll on radio', e) })

    // this.blu_receivers[poll_index].setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
    // radio.beeps = this.blu_receivers[poll_index].getDetections(radio_channel, Number(cmd.data.poll_interval))
    //   .then((values) => { console.log('get detection values', values); return values })
    //   .catch((e) => { console.error('get detections could not start', e) })
    // radio.dropped = this.blu_receivers[poll_index].getBluStats(radio_channel, Number(cmd.data.poll_interval))
    //   .then((values) => { console.log('get detection values', values); return values })
    //   .catch((e) => { console.error('get stats could not start', e) })
  }
}

export default BluStation
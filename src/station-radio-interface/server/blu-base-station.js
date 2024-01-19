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
    // this.bluStartWebSocketServer()
    this.bluServerBound()
    this.startBluRadios(path)
  }

  bluStartWebSocketServer() {

    this.sensor_socket_server.on('cmd', (cmd) => {
      console.log('blu sensor socket server cmd', cmd)

      switch (cmd.cmd) {
        // case ('blu_radio_all_on'):

        //   // let all_on_receiver = this.findBluReceiver(cmd)
        //   let on_index = this.blu_receivers.findIndex(receiver => receiver.port === Number(cmd.data.port))

        //   // const radios_on = Promise.all(all_on_receiver.blu_radios.map(radio => {
        //   //   radio.poll_interval = Number(cmd.data.poll_interval)
        //   //   all_on_receiver.updateConfig(all_on_receiver, radio.radio, radio.poll_interval)
        //   //   all_on_receiver.radioOn(radio, cmd.data.poll_interval)
        //   console.log('indexed blu receiver', this.blu_receivers[on_index].blu_radios)
        //   const radios_on = Promise.all(this.blu_receivers[on_index].blu_radios.map(radio => {
        //     radio.poll_interval = Number(cmd.data.poll_interval)
        //     this.blu_receivers[on_index].updateConfig(this.blu_receivers[on_index], radio.radio, radio.poll_interval)
        //     // this.blu_receivers[on_index].radioOn(radio, cmd.data.poll_interval)
        //     radio.beeps = this.blu_receivers[on_index].getDetections(radio.radio, radio.poll_interval)
        //       .then((result) => { return result })
        //       .catch((e) => { console.error(e) })
        //     radio.dropped = this.blu_receivers[on_index].getBluStats(radio.radio, radio.poll_interval)
        //       .then((result) => { return result })
        //       .catch((e) => { console.error(e) })

        //   })).then((values) => {
        //     console.log('all radios on', values)
        //   }).catch((e) => {
        //     console.error('all radios on error', e)
        //   })
        //   break;
        // case ('blu_radio_all_off'):
        //   let all_off_receiver = this.findBluReceiver(cmd)
        //   console.log('all off receiver', all_off_receiver)
        //   const radios_off = Promise.all(all_off_receiver.blu_radios.map(radio => {
        //     console.log('blu radio all off radio', radio)
        //     // all_off_receiver.radioOff(radio)
        //     all_off_receiver.stopDetections(radio)
        //   })).then((values) => {
        //     console.log('turning blu radio off', values)
        //   }).catch((e) => {
        //     console.error('all radios off error', e)
        //   })
        //   break
        case ('blu_led_all'):
          let all_led_receiver = this.findBluReceiver(cmd)

          const all_leds = Promise.all(all_led_receiver.blu_radios.map(radio => {
            all_led_receiver.setBluConfig(Number(radio.radio), { scan: cmd.data.scan, rx_blink: cmd.data.rx_blink, })
          })).then((values) => {
            console.log('turning radio leds on', values)
          }).catch((e) => {
            console.log('cannot turn radio leds on', e)
          })
          break
        case ('blu_reboot_all'):
          console.log('blu reboot all cmd', cmd)

          let all_reboot_receiver = this.findBluReceiver(cmd)
          console.log('all reboot receiver radios', all_reboot_receiver.blu_radios)
          // let reboot_index = this.findBluPort(cmd.data.port)

          const all_reboot = Promise.all(all_reboot_receiver.blu_radios.map(radio => {
            all_reboot_receiver.stopDetections(radio)

            // reset polling interval to 10 s on reboot
            let radio_channel = radio.radio
            radio.poll_interval = 10000
            all_reboot_receiver.updateConfig(all_reboot_receiver, radio_channel, radio.poll_interval)

            let poll_data = {
              port: all_reboot_receiver.port,
              channel: radio_channel,
              poll_interval: radio.poll_interval,
              msg_type: 'poll_interval',
            }

            this.broadcast(JSON.stringify(poll_data))
            all_reboot_receiver.rebootBluRadio(radio_channel, radio.poll_interval)
            all_reboot_receiver.radioOn(radio, radio.poll_interval)

          })).then((values) => {
            console.log('all radios rebooting', values)
          }).catch((e) => {
            console.error('all radios reboot error', e)
          })

          break
        // case ('all_change_poll'):

        //   let all_poll_receiver = this.findBluReceiver(cmd)
        //   // let poll_interval = Number(cmd.data.poll_interval)
        //   // set current poll interval in default-config
        //   let radios_all_poll = Promise.all(all_poll_receiver.blu_radios.map(radio => {
        //     radio.poll_interval = Number(cmd.data.poll_interval)
        //     // this.blu_paths[change_poll_all] = all_poll_receiver
        //     all_poll_receiver.updateConfig(all_poll_receiver, radio.radio, radio.poll_interval)
        //     // all_on_receiver.radioOn(radio.radio, cmd.data.poll_interval)

        //     let poll_data = {
        //       port: all_poll_receiver.port,
        //       channel: radio.radio,
        //       poll_interval: radio.poll_interval,
        //       msg_type: 'poll_interval',
        //     }
        //     this.broadcast(JSON.stringify(poll_data))

        //     all_poll_receiver.stopDetections(radio)
        //     all_poll_receiver.setBluConfig(radio.radio, { scan: 1, rx_blink: 1, })
        //     all_poll_receiver.radioOn(radio, radio.poll_interval)

        //   })).then((values) => {
        //     console.log('all radios change poll', values)
        //   }).catch((e) => {
        //     console.error('all radios change poll error', e)
        //   })

        //   break
        // case ('blu_update_all'):

        //   let all_update_receiver = this.findBluReceiver(cmd)

        //   // radio.poll_interval = Number(cmd.data.poll_interval)

        //   let blu_update_all = Promise.all(all_update_receiver.blu_radios.map(radio => {

        //     all_update_receiver.updateBluFirmware(radio, this.firmware, radio.poll_interval)
        //   })).then((values) => {
        //     console.log('turning blu radio off', values)
        //   }).catch((e) => {
        //     console.error(`Can't update all radios on port ${cmd.data.port}`)
        //   })
        //   break
        case ('toggle_blu'):

          if (cmd.data.type === 'blu_on') {

            let on = this.blu_receivers.find(receiver => receiver.port === Number(cmd.data.port))
            on.station.updateConfig(on.station, on.radio.radio, on.radio.poll_interval)
            on.station.radioOn(on.radio, on.radio.poll_interval)

          } else if (cmd.data.type === "blu_off") {

            let off = this.blu_receivers.find(receiver => receiver.port === Number(cmd.data.port))

            off.station.radioOff(off.radio)
          }
          break
        case ('toggle_blu_led'):

          let { data: { scan, rx_blink } } = cmd
          let led = this.blu_receivers.find(receiver => receiver.port === Number(cmd.data.port))
          led.station.setBluConfig(led.radio, { scan, rx_blink })

          break
        case ('reboot_blu_radio'):

          let reboot = this.blu_stations.findReceiverAndRadio(cmd)
          let { station, radio } = reboot
          let radio_channel = radio.radio
          let reboot_interval = 10000

          this.poll_data = {
            channel: radio_channel,
            poll_interval: reboot_interval,
            msg_type: 'poll_interval',
          }
          reboot.station.broadcast(JSON.stringify(this.poll_data))
          reboot.station.updateConfig(station, radio, reboot_interval)
          reboot.station.rebootBluReceiver(radio, reboot_interval)
          break
        // case ('change_poll'):
        //   let change_poll = this.blu_stations.findreceiverAndRadio(cmd)
        //   let { station: change_station, radio: change_radio, } = change_poll

        //   let change_channel = change_radio.radio
        //   let poll_change = change_radio.poll_interval

        //   this.poll_data = {
        //     port: cmd.data.port,
        //     channel: change_channel,
        //     poll_interval: poll_change,
        //     msg_type: 'poll_interval',
        //   }
        //   change_station.updateConfig(change_station, change_radio, poll_change)
        //   change_station.broadcast(JSON.stringify(this.poll_data))
        //   change_station.stopDetections(change_radio)
        //   change_station.setBluConfig(change_channel, { scan: 1, rx_blink: 1, })
        //   change_station.getDetections(change_channel, poll_change)
        //   break
        // case ('update-blu-firmware'):
        //   let update = this.blu_stations.findreceiverAndRadio(cmd)
        //   let { station: update_station, radio: update_radio, } = update
        //   update_station.updateBluFirmware(update_radio, this.firmware, update_radio.poll_interval, update_station.port)
        //   break
        default:
          break
      }
    })
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

            // console.log('blu detections job', job)
            console.log('Port', this.blu_receivers[br_index].port, 'radio', job.radio_channel, 'has', job.data.length, 'detections')
            // console.log('blu receiver detections', this.blu_channels)
            job.data.forEach((beep) => {
              // console.log('blu reader beep', beep)

              beep.data = { id: beep.id }
              beep.meta = { data_type: "blu_tag", rssi: beep.rssi, }
              beep.msg_type = "blu"
              beep.protocol = "1.0.0"
              beep.received_at = moment(new Date(beep.time)).utc()
              // beep.receiver = this.blu_receivers.find(receiver => receiver.channel === this.blu_receiver[br_index].channel)
              // console.log('beep receiver')
              beep.radio_index = this.blu_receivers[br_index].blu_radios.findIndex(radio =>
                radio.radio == beep.channel
              )

              // console.log('beep radio', beep.radio_index, 'beep receiver', this.blu_receivers.blu_radios[beep.radio_index])
              beep.poll_interval = this.blu_receivers[br_index].blu_radios[beep.radio_index].poll_interval
              // console.log('beep poll interval', beep.poll_interval)
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

            // console.error('base station get detections error on Port', this.blu_receivers[br_index].port, 'Radio', job.radio_channel, e)
          }
          break
        // console.log(JSON.stringify(job))
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
          // console.log('blu stats job', job)
          try {

            let blu_stats = {
              port: this.blu_receivers[br_index].port,
              channel: job.radio_channel,
              blu_dropped: job.data.det_dropped == null ? 0 : job.data.det_dropped,
              msg_type: "blu_dropped",
            }
            console.log('blu stats', blu_stats)
            console.log('Port', this.blu_receivers[br_index].port, 'radio', job.radio_channel, 'has', blu_stats.blu_dropped, 'detections dropped')

            this.broadcast(JSON.stringify(blu_stats))
          } catch (e) {
            console.log('base station stats error:', 'receiver', this.blu_receivers[br_index].port, 'radio', job.radio_channel, e)
            // blu_stats.blu_dropped = 0
            // this.broadcast(JSON.stringify(blu_stats))
          }
          break
        default:
          break
      }
    })

    this.blu_receivers[br_index].startUpFlashLogo()

    this.sendBluVersion(this.blu_receivers[br_index], 10000)

    // setInterval(() => {
    //   this.blu_receivers[br_index].blu_radios.forEach((radio) => {
    //     this.blu_receivers[br_index].getBluVersion(radio.radio)
    //   })
    // }, 10000)
    // const radios_version = Promise.all(this.blu_receivers[br_index].blu_radios
    //   .map((radio) => {
    //     let radio_channel = radio.radio
    //     this.blu_receivers[br_index].getBluVersion(radio_channel)
    //   })).then((values) => {
    //     console.log('getting blu radio versions')
    //   }).catch((e) => {
    //     console.error('cannot get versions for blu radios', e)
    //   })

    console.log('blu receivers array before radios start promsie', this.blu_receivers)

    const radios_start = Promise.all(this.blu_receivers[br_index].blu_radios
      .map((radio) => {
        console.log('radios start radio', radio)
        let radio_channel = radio.radio
        let poll_interval = radio.poll_interval
        this.blu_receivers[br_index].setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
        this.blu_receivers[br_index].getBluVersion(radio_channel)

        radio.beeps = this.blu_receivers[br_index].getDetections(radio_channel, poll_interval)
          .then((result) => { return result })
          .catch((e) => { console.error(e) })
        radio.dropped = this.blu_receivers[br_index].getBluStats(radio_channel, poll_interval)
          .then((result) => { return result })
          .catch((e) => { console.error(e) })
        radio.beeps.then((values) => console.log(values))
        radio.dropped.then((values) => console.log(values))
        console.log('radios start radio after timeout initialization', radio, 'on port', this.blu_receivers[br_index].port)

      })).then((values) => {
        console.log('radios started', values)
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
      // let br_index = this.findBluPath(path)
      // console.log('blu receiver', this, 'is closing')
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
      // const radios_exit = Promise.all(this.blu_receivers[br_index].blu_radios
      //   .map((radio) => {
      //     this.blu_receivers[br_index].radioOff(radio)
      //     console.log('receiver', this.blu_receivers[br_index].port, 'radio', radio.radio, 'is off')
      //   })).then((values) => {
      //     console.log(values)
      //   }).catch((e) => {
      //     console.error('can\'t turn off all radios, probably because receiver was destroyed', e)
      //   })

      // setTimeout(() => {
      //   console.log('Closed blu readers', this)
      // }, 5000)
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
    let radio = this.blu_receivers.blu_radios.find(radio => radio.radio === Number(channel))
    radio.poll_interval = poll_interval ? poll_interval : radio.poll_interval

    return { receiver, radio }
  }
}

export default BluStation
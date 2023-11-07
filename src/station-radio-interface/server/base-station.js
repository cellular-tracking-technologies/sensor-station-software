import { RadioReceiver } from './radio-receiver.js'
import { BluStation } from './blu-base-station.js'
import { BluReceiver, BluReceiverTask } from '../../hardware/bluseries-receiver/blu-receiver.js'
import Leds from '../../hardware/bluseries-receiver/driver/leds.js'
import SerialClient from '../../hardware/bluseries-receiver/driver/serial_client.js'

import { SensorSocketServer } from './http/web-socket-server.js'
import { GpsClient } from './gps-client.js'
import { StationConfig } from './station-config.js'
import { DataManager } from './data/data-manager.js'
import { ServerApi } from './http/server-api.js'
import { StationLeds } from './led/station-leds.js'
import { QaqcReport } from './qaqc/report.js'
import fetch from 'node-fetch'
import { spawn } from 'child_process'
import fs from 'fs'
import heartbeats from 'heartbeats'
import path from 'path'
import _ from 'lodash'
import moment from 'moment'
import process from 'node:process'
// import '../../hardware/bluseries-receiver/driver/bin'

/**
 * manager class for controlling / reading radios
 * and writing to disk
 */
class BaseStation {
  /**
   * 
   * @param {*} opts.config_filepath - string filename used to persist changes / control behaviour
   * @param {*} otps.radio_map_filepath - string filename used for radio channel mapping
   */
  constructor(opts) {
    this.config = new StationConfig({
      config_filepath: opts.config_filepath,
      radio_map_filepath: opts.radio_map_filepath
    })

    this.blu_radios = this.config.default_config.blu_radios
    // console.log('this blu radios', this.config.default_config.blu_radios)
    this.active_radios = {}
    this.station_leds = new StationLeds()
    this.gps_client = new GpsClient({
      max_gps_records: 50
    })
    this.gps_client.on('3d-fix', (fix) => {
      fix.msg_type = 'gps'
      let data = this.gps_client.info()
      data.msg_type = 'gps'
      this.broadcast(JSON.stringify(data))
    })
    this.station_id
    this.date_format
    this.gps_logger
    this.data_manager
    // record the date/time the station is started
    this.begin = moment(new Date()).utc()
    this.heartbeat = heartbeats.createHeart(1000)
    this.server_api = new ServerApi()
    this.radio_fw = {}
    this.blu_fw = {}
    // this.blu_radios = [1, 2, 3, 4]
    this.poll_interval
    this.poll_data

    // this.old_firmware = Buffer.from('../../hardware/bluseries-receiver/driver/bin/blu_adapter_v1.2.0+0.bin')
    // this.firmware = Buffer.from('../../hardware/bluseries-receiver/driver/bin/blu_adapter_v2.0.0+0.bin')
    // this.firmware = fs.readFileSync('../../hardware/bluseries-receiver/driver/bin/blu_adapter_v2.0.0+0.bin')
    this.firmware = '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/blu_adapter_v1.0.0+0.bin'
    // this.firmware = './blu_adapter_v2.0.0+0.bin'

    console.log('firmware', this.firmware)
    // console.log('station config blu radios', this.config.default_config.blu_radios)
  }

  /**
   * 
   * @param  {...any} msgs wrapper for data logger
   */
  stationLog(...msgs) {
    this.data_manager.log(msgs)
  }

  /**
   * load config - start the data manager, gps client, web socket server, timers, radios
   */
  async init() {
    await this.config.load()
    /** DO NOT MERGE DEFAULT CONFIG for now...
    // merge default config with current config if fields have been added
    // this.config.data = _.merge(this.config.default_config, this.config.data)
    */

    // save the config to disk
    this.config.save()

    // pull out config options to start everythign
    this.date_format = this.config.data.record.date_format
    this.station_id = await this.getId()
    let base_log_dir = this.config.data.record.base_log_directory

    this.data_manager = new DataManager({
      id: this.station_id,
      base_log_dir: base_log_dir,
      date_format: this.date_format,
      flush_data_cache_seconds: this.config.data.record.flush_data_cache_seconds
    })
    this.log_filename = `sensor-station-${this.station_id}.log`
    this.log_file_uri = path.join(base_log_dir, this.log_filename)

    // declare blu_reader class here to use it in websocket
    SerialClient.find_port({ manufacturer: "FTDI" }).then((port) => {
      console.log('instantiating receiver', port)
      const { comName: path } = port
      console.log(path)
      // return path
    }).catch((err) => {
      console.log(err)
    })

    console.log('this blu path', this.blu_path)
    this.blu_reader = new BluStation({
      // path: this.blu_path,
      // path: path,
      path: '/dev/ttyUSB0',
      data_manager: this.data_manager,
      broadcast: this.broadcast,
    })

    this.gps_client.start()
    this.stationLog('initializing base station')
    this.startWebsocketServer()
    this.startTimers()
    this.startRadios()

    this.startBluRadios()
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
   * start web socket server
   */
  startWebsocketServer() {
    this.sensor_socket_server = new SensorSocketServer({
      port: this.config.data.http.websocket_port,
    })
    this.sensor_socket_server.on('open', (event) => {
      // this.sensor_socket_server.send('server is open first message')
      // event.msg = "server is open first message"
      // this.broadcast(event)
      // console.log('opening event', event)

      // Object.keys(this.config.default_config.blu_radios).forEach((radio) => {
      //   let current_poll = {
      //     channel: radio,
      //     poll_interval: this.config.default_config.blu_radios[radio].values.default,
      //     msg_type: 'cmd',
      //     cmd: 'default_poll'
      //   }
      //   this.broadcast(JSON.stringify(current_poll))
      // })
    })
    this.sensor_socket_server.on('cmd', (cmd) => {
      switch (cmd.cmd) {
        case ('toggle_radio'):
          let channel = cmd.data.channel
          this.toggleRadioMode({
            channel: channel,
            mode: cmd.data.type
          })
          break
        case ('toggle_blu'):
          console.log('blu radio button clicked', cmd)

          // let blu_channel = Number(cmd.data.channel)
          if (cmd.data.type === 'blu_on') {
            console.log('turning blu radio on')


            const radios_on = Object.keys(this.blu_radios).map(radio => {
              this.config.default_config.blu_radios[Number(radio)].values.current = Number(cmd.data.poll_interval)
              this.blu_reader.updateConfig(this.config.default_config)
              this.blu_reader.radioOn(Number(radio), cmd.data.poll_interval)
            })
            console.log('radios on', radios_on)
            Promise.all(radios_on).then((values) => {
              console.log('promise radios', values)

            })
          } else if (cmd.data.type === "blu_off") {
            const radios_off = Object.keys(this.blu_radios).map(radio => {
              this.blu_reader.radioOff(radio)
            })
            Promise.all(radios_off).then((values) => {
              console.log('turning blu radio off', values)
            })
          }
          break
        case ('toggle_blu_led'):
          console.log('blu radio button clicked', cmd)
          // blu_channel = Number(cmd.data.channel)
          this.blu_reader.setBluConfig(
            Number(cmd.data.channel),
            {
              scan: cmd.data.scan,
              rx_blink: cmd.data.rx_blink,
            })
          console.log('turning blu led on/off')
          break
        case ('reboot_blu_radio'):
          console.log('blu reboot button clicked', cmd)
          let key = cmd.data.channel.toString()
          if (Object.keys(this.blu_radios).includes(key)) {
            // console.log('reboot blu radio key', this.config.default_config.blu_radios[key].values.max)
            this.config.default_config.blu_radios[key].values.current = this.blu_radios[key].values.default
            this.poll_data = {
              channel: cmd.data.channel,
              poll_interval: this.blu_radios[key].values.default,
              msg_type: 'poll_interval',
            }
          }

          this.blu_reader.updateConfig(this.config.default_config)

          console.log('after reboot', this.poll_data)
          this.broadcast(JSON.stringify(this.poll_data))
          setTimeout(() => {
            this.blu_reader.rebootBluReceiver(Number(cmd.data.channel), this.poll_data.poll_interval)
          }, 10000)
          break
        case ('change_poll'):
          let poll_key = cmd.data.channel.toString()

          if (Object.keys(this.config.default_config.blu_radios).includes(poll_key.toString())) {

            console.log('changing polling interval on Radio', cmd)
            this.poll_interval = Number(cmd.data.poll_interval)

            // set current poll interval in default-config
            this.config.default_config.blu_radios[poll_key].values.current = Number(this.poll_interval)
            console.log('radio', poll_key, 'is polling at', this.blu_radios[poll_key].values.current, 'poll interval')
            this.poll_data = {
              channel: cmd.data.channel,
              poll_interval: this.poll_interval,
              msg_type: 'poll_interval',
            }
            this.blu_reader.updateConfig(this.config.default_config)

            this.broadcast(JSON.stringify(this.poll_data))
            console.log('poll interval', this.poll_interval, typeof this.poll_interval)
            this.blu_reader.stopDetections(Number(cmd.data.channel))
            this.blu_reader.setBluConfig(Number(cmd.data.channel), { scan: 1, rx_blink: 1, })
            this.blu_reader.getDetections(Number(cmd.data.channel), this.poll_interval)
          }
          break
        case ('update-blu-firmware'):
          console.log('updating blu series receiver firmware', cmd)
          this.blu_reader.updateBluFirmware(Number(cmd.data.channel), this.firmware)
          break
        case ('stats'):
          let stats = this.data_manager.stats.stats
          stats.msg_type = 'stats'
          this.broadcast(JSON.stringify(stats))
          break
        case ('checkin'):
          this.checkin()
          break
        case ('upload'):
          this.runCommand('upload-station-data')
          break
        case ('update-station'):
          this.runCommand('update-station')
          break
        case ('radio-firmware'):
          this.broadcast(JSON.stringify({
            msg_type: 'radio-firmware',
            firmware: this.radio_fw,
          }))
          break
        case ('qaqc'):
          this.qaqc()
          break
        case ('about'):
          fetch('http://localhost:3000/about')
            .then(res => res.json())
            .then((json) => {
              let data = json
              data.station_id = this.station_id
              data.msg_type = 'about'
              data.begin = this.begin
              this.broadcast(JSON.stringify(data))
            })
            .catch((err) => {
              console.log('unable to request info from hardware server')
              console.error(err)
            })
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
   * @param {*} cmd - run a given bash command and pipe output to web socket
   */
  runCommand(cmd) {
    const command_process = spawn(cmd)
    this.stationLog('running command', cmd)
    command_process.stdout.on('data', (data) => {
      let msg = {
        data: data.toString(),
        msg_type: 'log'
      }
      this.stationLog(data)
      this.broadcast(JSON.stringify(msg))
    })
    command_process.stderr.on('data', (data) => {
      let msg = {
        data: data.toString(),
        msg_type: 'log'
      }
      this.stationLog('stderr', data)
      this.broadcast(JSON.stringify(msg))
    })
    command_process.on('close', (code) => {
      this.stationLog('finished running', cmd, code)
    })
    command_process.on('error', (err) => {
      console.error('command error')
      console.error(err)
      this.stationLog('command error', err.toString())
    })
  }

  /**
   * run qaqc - send diagnostics over radio
   */
  qaqc() {
    this.log('init QAQC report')
    // use radio 1
    let radio = this.active_radios[1]
    let stats = this.data_manager.stats.stats
    let report = new QaqcReport({
      station_id: this.station_id,
      stats: stats.channels
    })
    report.getResults().then((results) => {
      let packets = report.generatePackets(results)
      let cmds = []

      Object.keys(packets).forEach((key) => {
        let packet = packets[key]
        let msg = packet.packet.base64()
        cmds.push('tx:' + msg)
      })
      radio.issueCommands(cmds)
    })
  }

  getRadioFirmware() {
    return Object.keys(this.radio_fw)
      .map((channel) => ({
        channel: channel,
        version: this.radio_fw[channel],
      }))
  }

  getBluFirmware() {
    return Object.keys(this.blu_fw)
      .map((channel) => ({
        channel: channel,
        version: this.blu_fw[channel],
      }))
  }

  /**
   * checkin to the server
   */
  checkin() {
    this.stationLog('server checkin initiated')
    this.server_api.healthCheckin(this.data_manager.stats.stats, this.getRadioFirmware())
      .then((response) => {
        if (response == true) {
          this.stationLog('server checkin success')
        } else {
          this.stationLog('checkin failed')
        }
      })
      .catch((err) => {
        this.stationLog('server checkin error', err.toString())
      })
  }

  /**
   * control on-board LEDs
   */
  async toggleLeds() {
    this.station_leds.toggleAll(this.gps_client.latest_gps_fix)
      .catch(err => {
        console.log('unable to toggle LEDs')
        console.error(err)
      })
  }

  /**
   * 
   */
  writeAliveMsg() {
    this.stationLog('alive')
  }

  /**
   * 
   */
  pollSensors() {
    this.stationLog('polling sensor data')
    try {
      this.server_api.pollSensors()
    } catch (err) {
      this.stationLog(`error polling sensor data ${err.toString()}`)
    }
  }

  rotateDataFiles() {
    this.stationLog('rotating data files')
    this.data_manager.rotate()
      .then(() => {
        this.stationLog('rotation finished')
      })
      .catch((err) => {
        this.stationLog(`error rotating data files: ${err}`)
      })
  }

  /**
   * start timers for writing data to disk, collecting GPS data
   */
  startTimers() {
    // start data rotation timer
    // checkin after 5 seconds of station running
    setTimeout(this.checkin.bind(this), 10 * 1000)
    // this.heartbeat.createEvent(5, this.qaqc.bind(this))
    this.heartbeat.createEvent(this.config.data.record.rotation_frequency_minutes * 60, this.rotateDataFiles.bind(this))
    this.heartbeat.createEvent(this.config.data.record.sensor_data_frequency_minutes * 60, this.pollSensors.bind(this))
    this.heartbeat.createEvent(this.config.data.record.checkin_frequency_minutes * 60, this.checkin.bind(this))

    this.heartbeat.createEvent(this.config.data.led.toggle_frequency_seconds, this.toggleLeds.bind(this))
    this.heartbeat.createEvent(this.config.data.record.alive_frequency_seconds, this.writeAliveMsg.bind(this))
    if (this.config.data.record.enabled === true) {
      // start data write to disk timer
      this.heartbeat.createEvent(this.config.data.record.flush_data_cache_seconds, this.data_manager.writeCache.bind(this.data_manager))
      if (this.config.data.gps.enabled === true) {
        if (this.config.data.gps.record === true) {
          // start gps timer
          this.heartbeat.createEvent(this.config.data.gps.seconds_between_fixes, (count, last) => {
            this.stationLog('recording GPS fix')
            this.data_manager.handleGps(this.gps_client.info())
          })
        }
      }
    }
  }

  /**
   * get base station id
   */
  getId() {
    return fs.readFileSync('/etc/ctt/station-id').toString().trim()
  }

  /**
   * 
   * @param {*} msg - message to broadcast across the web socket server
   */
  broadcast(msg) {
    if (this.sensor_socket_server) {
      this.sensor_socket_server.broadcast(msg)
    }
  }

  /**
   * 
   * @param  {...any} msgs - broadcast data across web socket server
   */
  log(...msgs) {
    this.broadcast(JSON.stringify({ 'msg_type': 'log', 'data': msgs.join(' ') }))
    msgs.unshift(moment(new Date()).utc().format(this.date_format))
  }

  /**
   * start the radio receivers
   */
  startRadios() {
    console.log('starting radio receivers')
    this.stationLog('starting radio receivers')
    this.config.data.radios.forEach((radio) => {
      // console.log('radio path', radio)
      if (radio.path) {
        let beep_reader = new RadioReceiver({
          baud_rate: 115200,
          port_uri: radio.path,
          channel: radio.channel
        })
        beep_reader.on('beep', (beep) => {
          // console.log('beep', beep)
          this.data_manager.handleRadioBeep(beep)
          beep.msg_type = 'beep'
          this.broadcast(JSON.stringify(beep))
        })
        beep_reader.on('radio-fw', (fw_version) => {
          this.radio_fw[radio.channel] = fw_version
        })
        beep_reader.on('open', (info) => {
          this.stationLog('opened radio on port', radio.channel)
          // this.active_radios[info.port_uri] = info
          beep_reader.issueCommands(radio.config)
        })
        beep_reader.on('write', (msg) => {
          this.stationLog(`writing message to radio ${msg.channel}: ${msg.msg}`)
        })
        beep_reader.on('error', (err) => {
          console.log('reader error', err)
          console.error(err)
          // error on the radio - probably a path error
          beep_reader.stopPollingFirmware()
          this.stationLog(`radio error on channel ${radio.channel}  ${err}`)
        })
        beep_reader.on('close', (info) => {
          this.stationLog(`radio closed ${radio.channel}`)
          if (info.port_uri in Object.keys(this.active_radios)) {
          }
        })
        beep_reader.start(1000)
        this.active_radios[radio.channel] = beep_reader

      } // end of if(radio.path)
    }) // end of config.data.radios for loop      
  } // end of startRadios()

  startBluRadios() {
    console.log('blu receiver on')
    // SerialClient.find_port({ manufacturer: "FTDI" }).then((port) => {
    //   console.log('instantiating receiver', port)
    //   const { comName: path } = port
    //   console.log(path)

    //   let blu_reader = new BluStation({
    //     path: path,
    //     data_manager: this.data_manager,
    //     broadcast: this.broadcast,
    //   })

    this.blu_reader.on('complete', (job) => {
      // console.log('blu reader job', job)
      switch (job.task) {
        case BluReceiverTask.VERSION:
          console.log(`BluReceiverTask.VERSION ${JSON.stringify(job)}`)
          this.stationLog(`BluReceiver Radio ${job.radio_channel} is ${job.data.version}`)
          this.blu_fw = {
            msg_type: 'blu-firmware',
            firmware: {
              [job.radio_channel]: job.data.version,
            }
          }
          console.log('this.blu_fw', this.blu_fw)
          this.broadcast(JSON.stringify(this.blu_fw))
          break
        case BluReceiverTask.DETECTIONS:
          // console.log(`BluReceiverTask.DETECTIONS ${JSON.stringify(job)}`)

          if (job.data.length) {
            console.log('Radio', job.radio_channel, 'has', job.data.length, 'detections')
          }
          job.data.forEach((beep) => {
            beep.data = { id: beep.id }
            beep.meta = { data_type: "blu_tag", rssi: beep.rssi, }
            this.data_manager.handleBluBeep(beep)
            beep.msg_type = "blu"
            beep.protocol = "1.0.0"
            beep.received_at = moment(new Date(beep.time)).utc()
            // beep.blu_channel = beep.channel
            // beep.channel = undefined
            // console.log('blu beep', beep)
            beep.poll_interval = this.config.default_config.blu_radios[beep.channel].values.current

            this.broadcast(JSON.stringify(beep))
            // console.log('string beep', JSON.stringify(beep))
          })
          break
        // console.log(JSON.stringify(job))
        case BluReceiverTask.DFU:
          // dfu download completed and then triggers reboot
          // this.blu_reader.getBluVersion(job.radio_channel)
          console.log(`BluReceiverTask.DFU ${JSON.stringify(job)}`)
          this.blu_reader.schedule({ task: BluReceiverTask.REBOOT, radio_channel: job.radio_channel })

          // // this.blu_reader.rebootBluReceiver(job.radio_channel, 10000)
          setTimeout(() => {
            // this.blu_reader.rebootBluReceiver(job.radio_channel, 10000)
            this.blu_reader.getBluVersion(job.radio_channel)
            this.stationLog(`BluReceiver Radio ${job.radio_channel} updated to version ${job.data.version}`)

            // this.stationLog(`BluReceiver Radio ${job.radio_channel} updated to version ${job.data.version}`)
          }, 30000)

          break
        case BluReceiverTask.REBOOT:
          console.log(`BluReceiverTask.REBOOT ${JSON.stringify(job)}`)
          this.stationLog(`BluReceiver Radio ${job.radio_channel} is rebooting`)

          // this.setLogoFlash(radio_channel, 
          //   { led_state: 2, blink_rate: 1000, blink_count: -1 })

          console.log('Blu Receiver is rebooting!', job.radio_channel)
          break
        case BluReceiverTask.LEDS:
          console.log(`BluReceiverTask.LEDS ${JSON.stringify(job)}`)
          break
        case BluReceiverTask.CONFIG:
          console.log(`BluReceiverTask.CONFIG ${JSON.stringify(job)}`)
          // would like to get config data object to log changes to radio/led on/off
          this.stationLog(`BluReceiver Radio ${job.radio_channel} config has changed.`)

          break
        case BluReceiverTask.STATS:
          if (job.data.det_dropped !== null) {
            console.log('Radio', job.radio_channel, 'has', job.data.det_dropped, 'detections dropped')
            let blu_stats = {
              channel: job.radio_channel,
              blu_dropped: job.data.det_dropped == null ? 0 : job.data.det_dropped,
              msg_type: "blu_stats",
            }
            // this.broadcast(JSON.stringify(job.data.det_dropped))
            this.broadcast(JSON.stringify(blu_stats))
          }
          break
        default:
          break
      }
    })
    // this.blu_reader.on('close', () => {
    //   stationLog('blu radio is closing')
    //   console.log('blu radio is closed')
    //   this.blu_reader.radioOff(1)
    //   this.blu_reader.radioOff(2)
    //   this.blu_reader.radioOff(3)
    //   this.blu_reader.radioOff(4)
    //   // process.exit(0)
    // })
    process.on('SIGINT', () => {
      this.stationLog("\nGracefully shutting down from SIGINT (Ctrl-C)")
      console.log("\nGracefully shutting down from SIGINT (Ctrl-C)")
      
      const radios_exit = Object.keys(this.blu_radios).map(radio => {
        // this.blu_reader.setLogoFlash(radio, { scan: 0, rx_blink: 0,})
        this.blu_reader.radioOff(radio)
      })
      Promise.all(radios_exit).then((values) => {
        console.log(values)
      })
      setTimeout(() => {
        process.exit(0)
      }, 5000)
    })

    // this.blu_reader.startUpFlashLogo()

    this.blu_reader.getBluVersion(1)
    this.blu_reader.getBluVersion(2)
    this.blu_reader.getBluVersion(3)
    this.blu_reader.getBluVersion(4)

    // why does this break the regular logo flashing?

    // this.blu_reader.updateBluFirmware(4, this.firmware) 

    const radios_start = Promise.all(Object.keys(this.blu_radios).map((radio) => {
      // setTimeout(() => {
        let key = Number(radio)
        // this.blu_reader.getBluVersion(radio) // outputs timeout error still
        this.blu_reader.radioOn(key, this.blu_radios[key].values.current)
        // this.blu_reader.setLogoFlash(key, { led_state: 2, blink_rate: 1000, blink_count: -1})

      // }, 10000)
    })).then((values) => {
      console.log('radios started')
    }).catch((e) => {
      console.error(e)
    })
  }

} // end of base station class

export { BaseStation }

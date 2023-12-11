import { RadioReceiver } from './radio-receiver.js'
import { BluStation } from './blu-base-station.js'
import { BluReceiverTask } from '../../hardware/bluseries-receiver/blu-receiver.js'
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
import chokidar from 'chokidar'
import blu_config from '../../../system/radios/blu-radio-map.js'

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

    // this.blu_radios = this.config.default_config.blu_radios
    this.blu_receivers = this.config.default_config.blu_receivers
    this.blu_config = blu_config
    this.blu_reader
    this.blu_receiver = []
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
    this.poll_interval
    this.poll_data
    this.firmware = '/lib/ctt/sensor-station-software/src/hardware/bluseries-receiver/driver/bin/blu_adapter_v1.0.0+0.bin'
    this.dongle_port
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

    this.gps_client.start()
    this.stationLog('initializing base station')
    this.directoryWatcher()
    this.startWebsocketServer()
    this.startTimers()
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

          if (cmd.data.type === 'blu_on') {
            console.log('turning blu radio on')
            let br_index = this.findBluPort(cmd.data.port)

            console.log('turn radios on blu receiver', this.blu_receiver[br_index])
            const radios_on = this.blu_receiver[br_index].blu_radios.map(radio => {
              this.blu_receivers[this.blu_receiver[br_index].port.toString()].settings.values.current = Number(cmd.data.poll_interval)
              this.config.default_config.blu_receivers = this.blu_receivers
              this.blu_receiver[br_index].updateConfig(this.config.default_config)
              this.blu_receiver[br_index].radioOn(Number(radio), cmd.data.poll_interval)
            })
            console.log('radios on', radios_on)
            Promise.all(radios_on).then((values) => {
              console.log('promise radios', values)

            })
          } else if (cmd.data.type === "blu_off") {
            let br_index = this.findBluPort(cmd.data.port)

            const radios_off = this.blu_receiver[br_index].blu_radios.map(radio => {
              this.blu_receiver[br_index].radioOff(radio)
            })
            Promise.all(radios_off).then((values) => {
              console.log('turning blu radio off', values)
            })
          }
          break
        case ('toggle_blu_led'):
          console.log('blu radio button clicked', cmd)
          // let ledon_index = this.blu_receiver.findIndex(receiver => receiver.port === Number(cmd.data.port))
          let ledon_index = this.findBluPort(cmd.data.port)

          const leds_on = this.blu_receiver[ledon_index].blu_radios.map(radio => {
            this.blu_receiver[ledon_index].setBluConfig(Number(radio), { scan: cmd.data.scan, rx_blink: cmd.data.rx_blink, })
          })

          Promise.all(leds_on).then((values) => {
            console.log('turning radio leds on', values)
          }).catch((e) => {
            console.log('cannot turn radio leds on', e)
          })
          console.log('turning blu led on/off')
          break
        case ('reboot_blu_radio'):
          console.log('blu reboot button clicked', cmd)
          let reboot_index = this.findBluPort(cmd.data.port)
          this.blu_receivers[this.blu_receiver[reboot_index].port.toString()].blu_radios.forEach((radio) => {

            let default_poll = this.blu_receivers[this.blu_receiver[reboot_index].port.toString()].settings.values.default
            console.log('default polling interval', default_poll)
            this.blu_receivers[this.blu_receiver[reboot_index].port.toString()].settings.values.current = default_poll

            this.poll_data = {
              channel: radio,
              poll_interval: this.blu_receivers[this.blu_receiver[reboot_index].port.toString()].settings.values.default,
              msg_type: 'poll_interval',
            }
            console.log('after reboot', this.poll_data)
            this.broadcast(JSON.stringify(this.poll_data))
          })
          this.config.default_config.blu_receivers = this.blu_receivers
          this.blu_receiver[reboot_index].updateConfig(this.config.default_config)

          setTimeout(() => {
            Object.keys(this.blu_receiver[reboot_index].blu_radios).forEach((radio) => {
              this.blu_receiver[reboot_index].rebootBluReceiver(Number(radio), this.poll_data.poll_interval)
            })
          }, 10000)
          break
        case ('change_poll'):
          console.log('change poll interval', cmd)
          let br_index = this.findBluPort(cmd.data.port)
          console.log('change poll blu receiver', this.blu_receiver[br_index])
          // let port_key = cmd.data.port.toString()

          console.log('changing polling interval on Radio', cmd)
          this.poll_interval = Number(cmd.data.poll_interval)

          // set current poll interval in default-config
          this.blu_receivers[this.blu_receiver[br_index].port.toString()].blu_radios.forEach((radio) => {
            console.log('change poll radio', radio)
            // radio.values.current = Number(this.poll_interval)
            this.blu_receivers[this.blu_receiver[br_index].port.toString()].settings.values.current = this.poll_interval
            console.log('radio', radio, 'is polling at', this.blu_receivers[this.blu_receiver[br_index].port.toString()].settings.values.current, 'poll interval')
            this.poll_data = {
              port: cmd.data.port,
              channel: radio,
              poll_interval: this.poll_interval,
              msg_type: 'poll_interval',
            }
            this.config.default_config.blu_receivers = this.blu_receivers
            this.blu_receiver[br_index].updateConfig(this.config.default_config)

            this.broadcast(JSON.stringify(this.poll_data))
            console.log('poll interval', this.poll_interval, typeof this.poll_interval)

            this.blu_receiver[br_index].stopDetections(Number(radio))
            this.blu_receiver[br_index].setBluConfig(Number(radio), { scan: 1, rx_blink: 1, })
            this.blu_receiver[br_index].getDetections(Number(radio), this.poll_interval)
          })
          break
        case ('update-blu-firmware'):
          console.log('updating blu series receiver firmware', cmd)
          let update_index = this.findBluPort(cmd.data.port)
          console.log('update blu firmware default poll interval', this.blu_receivers[this.blu_receiver[update_index].port].settings.values.current)
          let poll_interval = this.blu_receivers[this.blu_receiver[update_index].port].settings.values.current
          console.log('update firmware poll interval', poll_interval)

          this.blu_receiver[update_index].blu_radios.forEach((radio) => {
            this.blu_receiver[update_index].updateBluFirmware(Number(radio), this.firmware, poll_interval)
          })
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
 * file watcher using chokidar
 */
  directoryWatcher() {
    chokidar.watch('../../../../../../dev/serial/by-path')
      .on('change', path => {
        // console.log('chokidar change path', path)
        if (!path.includes('0:1.2.') && path.includes('-port0')) {
          // this.startBluRadios(path)
          let add_index = this.findBluPath(path)
          let port = this.blu_receiver[add_index].port
          // console.log('add index', add_index)
          let add_receiver = {
            msg_type: 'add_port',
            port: port,
            poll_interval: this.blu_receivers[port.toString()].settings.values.current,
          }
          // console.log('add receiver', add_receiver)
          this.broadcast(JSON.stringify(add_receiver))
        }
      })
      .on('add', path => {
        console.log('chokidar path', path)
        // console.log('directory watcher blu receiver array', this.blu_receiver)
        this.broadcast(JSON.stringify('add port'))

        if (!path.includes('0:1.2.') && path.includes('-port0')) {
          this.startBluRadios(path)

        } else if (!path.includes('-port0')) {
          this.startRadios(path)
        }
      })
      .on('unlink', path => {
        if (!path.includes('0:1.2.') && path.includes('-port0')) {

          console.log('unlink path', path)

          let unlink_index = this.findBluPath(path)
          console.log('unlink index', unlink_index)
          let unlink_receiver = {
            msg_type: "unlink_port",
            port: this.blu_receiver[unlink_index].port,
          }
          console.log('unlink receiver', unlink_receiver)

          this.broadcast(JSON.stringify(unlink_receiver))

          this.stopBluRadios(path)
          this.blu_receiver[unlink_index].destroy_receiver()

        } else if (!path.includes('-port0')) {
          console.log('dongle radio removed from usb port')
          let unlink_dongle = {
            msg_type: "unlink_dongle",
            path: path.substring(17),
            port: this.dongle_port,
          }
          this.broadcast(JSON.stringify(unlink_dongle))
        }
      })
  }

  /**
   * 
   * @param {String} path radio path from /dev/serial/by-path/ directory 
   * @returns 
   */
  findRadioPath(path) {
    let radio_path = path.substring(17)
    let radio_index = this.config.data.radios.findIndex(radio => radio.path === radio_path)
    let radio = this.config.data.radios[radio_index]
    return radio
  }

  /**
 * 
 * @param {String} path radio path from /dev/serial/by-path/ directory 
 * @returns 
 */
  findBluReceiver(path) {
    let radio_path = path.substring(17)
    // console.log('find blu path path', radio_path)
    let radio_index = this.blu_config.findIndex(radio => radio.path === radio_path)
    // console.log('find blu path radio index', radio_index)
    let radio = this.blu_config[radio_index]
    // console.log('find blu path radio', radio)
    return radio
  }

  /**
   * start the radio receivers
   */
  startRadios(path) {

    this.stationLog('starting radio receivers')
    let radio = this.findRadioPath(path)
    let beep_reader = new RadioReceiver({
      baud_rate: 115200,
      port_uri: radio.path,
      channel: radio.channel,
      // restart_on_close: false,
    })
    beep_reader.on('beep', (beep) => {
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
      console.log('reader error', err, radio.channel)
      console.error(err)
      // error on the radio - probably a path error
      beep_reader.stopPollingFirmware()
      this.stationLog(`radio error on channel ${radio.channel}  ${err}`)
    })
    beep_reader.on('close', (info) => {
      this.stationLog(`radio closed ${radio.channel}`)
      this.dongle_port = radio.channel
      beep_reader.stopPollingFirmware()
      beep_reader.destroy()
      console.log(`radio closed ${radio.channel}`, beep_reader)
      if (info.port_uri in Object.keys(this.active_radios)) {
      }
    })
    beep_reader.start(1000)
    this.active_radios[radio.channel] = beep_reader
  } // end of startRadios()

  // startBluRadios(path) {
  startBluRadios(path) {

    // let add_index = this.findBluPath(path)
    // console.log('add index', add_index)
    // let add_receiver = {
    //   msg_type: 'add_port',
    //   port: this.blu_receiver[add_index].port
    // }
    // console.log('add receiver', add_receiver)
    // this.broadcast(JSON.stringify(add_receiver))

    let blu_radio = this.findBluReceiver(path)
    console.log(' start blu radios blu radio', blu_radio)
    // let blu_reader = new BluStation({
    this.blu_reader = new BluStation({
      path: blu_radio.path,
      port: blu_radio.channel,
    })
    // console.log('blu reader before', blu_reader)
    // blu_reader.path = blu_radio.path
    console.log('blu reader before', this.blu_reader)
    this.blu_reader.path = blu_radio.path
    // this.blu_receiver.push(blu_reader)
    this.blu_receiver.push(this.blu_reader)
    delete this.blu_reader
    console.log('blu reader after', this.blu_reader)
    // blu_reader = undefined
    // console.log('blu reader after', blu_reader)

    let br_index = this.blu_receiver.findIndex(blu_reader => blu_reader.path === blu_radio.path)
    console.log('blu receiver', this.blu_receiver[br_index])

    // let add_receiver = {
    //   msg_type: 'add_port',
    //   port: this.blu_receiver[br_index].port
    // }
    // console.log('add receiver', add_receiver)
    // this.broadcast(JSON.stringify(add_receiver))

    setTimeout(() => {

    }, 2000)

    // console.log('start blu radios blu reader by index', br_index, blu_reader)
    this.blu_receiver[br_index].on('complete', (job) => {

      switch (job.task) {
        case BluReceiverTask.VERSION:
          try {
            console.log(`BluReceiverTask.VERSION ${JSON.stringify(job)}`)
            this.stationLog(`BluReceiver Radio ${job.radio_channel} is ${job.data.version}`)
            this.blu_fw = {
              msg_type: 'blu-firmware',
              firmware: {
                [this.blu_receiver[br_index].port]: {
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
          // console.log(`BluReceiverTask.DETECTIONS ${JSON.stringify(job)}`)
          try {
            console.log('Port', this.blu_receiver[br_index].port, 'radio', job.radio_channel, 'has', job.data.length, 'detections')
            job.data.forEach((beep) => {
              beep.data = { id: beep.id }
              beep.meta = { data_type: "blu_tag", rssi: beep.rssi, }
              beep.msg_type = "blu"
              beep.protocol = "1.0.0"
              beep.received_at = moment(new Date(beep.time)).utc()
              // beep.poll_interval = this.config.default_config.blu_receivers[this.blu_receiver[br_index].port.toString()].blu_radios[beep.channel].values.current
              beep.poll_interval = this.blu_receivers[this.blu_receiver[br_index].port.toString()].settings.values.current
              beep.port = this.blu_receiver[br_index].port
              this.data_manager.handleBluBeep(beep)
              this.broadcast(JSON.stringify(beep))
            })
            let blu_sum = {
              port: this.blu_receiver[br_index].port,
              channel: job.radio_channel,
              blu_beeps: job.data.length == null ? 0 : job.data.length,
              msg_type: "blu_stats",
            }
            this.broadcast(JSON.stringify(blu_sum))
          } catch (e) {
            console.error('base station get detections error on Port', this.blu_receiver[br_index].port, 'Radio', job.radio_channel, e)
          }
          break
        // console.log(JSON.stringify(job))
        case BluReceiverTask.DFU:
          // dfu download completed and then triggers reboot
          console.log(this.blu_receiver[br_index].port, `BluReceiverTask.DFU ${JSON.stringify(job)}`)
          // blu_reader.getBluVersion(job.radio_channel)
          break
        case BluReceiverTask.REBOOT:
          console.log(`BluReceiverTask.REBOOT ${JSON.stringify(job)}`)
          this.stationLog(`BluReceiver Radio ${job.radio_channel} is rebooting`)
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
          try {

            let blu_stats = {
              port: this.blu_receiver[br_index].port,
              channel: job.radio_channel,
              blu_dropped: job.data.det_dropped == null ? 0 : job.data.det_dropped,
              msg_type: "blu_dropped",
            }
            console.log('Port', this.blu_receiver[br_index].port, 'radio', job.radio_channel, 'has', blu_stats.blu_dropped, 'detections dropped')

            this.broadcast(JSON.stringify(blu_stats))
          } catch (e) {
            console.log('base station stats error:', 'receiver', this.blu_receiver[br_index].port, 'radio', job.radio_channel, e)
          }
          break
        default:
          break
      }
    })

    // let add_receiver = {
    //   msg_type: 'add_port',
    //   port: this.blu_receiver[br_index].port
    // }
    // console.log('add receiver', add_receiver)
    // this.broadcast(JSON.stringify(add_receiver))
    // why does this break the regular logo flashing?
    this.blu_receiver[br_index].startUpFlashLogo()

    // get versions are on a timer so version number can be loaded to interface
    setInterval(() => {
      this.blu_receiver[br_index].getBluVersion(1)
      this.blu_receiver[br_index].getBluVersion(2)
      this.blu_receiver[br_index].getBluVersion(3)
      this.blu_receiver[br_index].getBluVersion(4)
    }, 10000)

    const radios_start = Promise.all(this.blu_receivers[this.blu_receiver[br_index].port.toString()].blu_radios.map((radio) => {
      console.log('radios start radio', radio)
      let radio_key = radio.toString()
      let port_key = this.blu_receiver[br_index].port.toString()
      this.blu_receiver[br_index].radioOn(Number(radio_key), this.blu_receivers[port_key].settings.values.current)
    })).then((values) => {
      console.log('radios started')
    }).catch((e) => {
      console.error('radios could not start properly', e)
    })

    this.blu_receiver[br_index].on('close', () => {
      console.log('blu receiver closing within startBluRadios')
    })

    process.on('SIGINT', () => {
      this.stationLog("\nGracefully shutting down from SIGINT (Ctrl-C)")

      if (this.blu_receiver[br_index].port) {

        console.log("\nGracefully shutting down from SIGINT (Ctrl-C)", this.blu_receiver[br_index].port)
        const radios_exit = Promise.all(this.blu_receivers[this.blu_receiver[br_index].port.toString()].blu_radios
          .map((radio) => {
            this.blu_receiver[br_index].radioOff(radio)
            console.log('receiver', this.blu_receiver[br_index].port, 'radio', radio, 'is off')
          }))
        Promise.all(radios_exit).then((values) => {
          console.log(values)
        }).catch((e) => {
          console.error('no port to closed in destroyed blu receiver', e)
        })
      } else {
        console.log("\nGracefully shutting down from SIGINT (Ctrl-C)", this.blu_receiver[br_index])

      }

      // uncomment to destroy each receiver, need to find way to do this after turning off all radios in receiver
      // this.blu_receiver.forEach((receiver) => {
      //   receiver.destroy_receiver()
      // })
      setTimeout(() => {
        console.log('Closed blu readers', this.blu_receiver)
        process.exit(0)
      }, 7000)
    })
    // }) // end of forEach
  } // end of startBluRadios

  stopBluRadios(path) {
    if (path !== undefined) {
      console.log('stop blu radios path', path)
      let br_index = this.findBluPath(path)

      this.stationLog('blu radio is closing')
      console.log('blu receiver', this.blu_receiver[br_index], 'is closing')
      const radios_exit = Promise.all(this.blu_receivers[this.blu_receiver[br_index].port.toString()].blu_radios
        .map((radio) => {
          this.blu_receiver[br_index].radioOff(radio)
          console.log('receiver', this.blu_receiver[br_index].port, 'radio', radio, 'is off')
        }))
      Promise.all(radios_exit).then((values) => {
        console.log(values)
      }).catch((e) => {
        console.error('can\'t turn off all radios, probably because receiver was destroyed', e)
      })

      // this.blu_receiver[br_index].destroy_receiver()

      setTimeout(() => {
        console.log('Closed blu readers', this.blu_receiver)
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
    let index = this.blu_receiver.findIndex(receiver => receiver.port === Number(port))
    return index
  }

  /**
   * 
   * @param {String} path 
   * @returns 
   */
  findBluPath(path) {
    let index = this.blu_receiver.findIndex(receiver => receiver.path === path.substring(17))
    // console.log('findBluPath index', index)
    return index
  }



} // end of base station class

export { BaseStation }
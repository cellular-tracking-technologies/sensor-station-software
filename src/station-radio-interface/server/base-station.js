import { RadioReceiver } from './radio-receiver.js'
import BluStation from './blu-base-station.js'
import { SensorSocketServer } from './http/web-socket-server.js'
import { GpsClient } from './gps-client.js'
import { StationConfig } from './station-config.js'
import { DataManager } from './data/data-manager.js'
import { ServerApi } from './http/server-api.js'
import { StationLeds } from './led/station-leds.js'
import fetch from 'node-fetch'
import { spawn } from 'child_process'
import fs from 'fs'
import heartbeats from 'heartbeats'
import path from 'path'
import _ from 'lodash'
import moment from 'moment'
import chokidar from 'chokidar'
import revision from '../../revision.js'

/**
 * manager class for controlling / reading radios
 * and writing to disk
 */
class BaseStation {
  /**
   * 
   * @param {String} config_filepath - string filename used to persist changes / control behaviour
   */
  constructor(config_filepath) {
    this.config = new StationConfig(config_filepath)
    this.blu_station
    this.blu_receivers = []
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
    this.begin = moment(new Date()).utc()
    this.heartbeat = heartbeats.createHeart(1000)
    this.server_api = new ServerApi()
    this.radio_fw = {}
    this.blu_fw = {}
    this.poll_interval
    this.poll_data
    this.dongle_port
    this.blu_radio_filemap
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
    this.blu_receivers = this.config.data.blu_receivers

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
    this.startWebsocketServer()

    this.blu_station = new BluStation({
      blu_receivers: this.blu_receivers,
      data_manager: this.data_manager,
      broadcast: this.broadcast,
      websocket: this.sensor_socket_server,
      blu_firmware: this.firmware,
      server_api: this.server_api,
    })
    this.directoryWatcher()
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
 * 
 * @param {Object} opts 
 * @param {Number} opts.receiver_channel
 * @param {Number} opts.blu_radio_channel
 * @param {Number} opts.poll_interval
 * @param {String} opts.radio_state
 */
  toggleBluState(opts) {

    this.config.toggleRadioMode({
      receiver_channel: opts.receiver_channel,
      poll_interval: opts.poll_interval,
      blu_radio_channel: opts.blu_radio_channel,
      radio_state: opts.radio_state,
    })
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
        case ('blu_radio_all_on'):
          this.blu_station.bluRadiosAllOn(cmd)
          this.setBluReceiverState(cmd)
          break;
        case ('blu_radio_all_off'):
          console.log('blu radio all off cmd', cmd)
          this.blu_station.bluRadiosAllOff(cmd)
          this.setBluReceiverState(cmd)
          break
        case ('blu_led_all'):
          this.blu_station.bluRadiosAllLed(cmd)
          break
        case ('blu_reboot_all'):
          this.blu_station.bluRadiosAllReboot(cmd)
          break
        case ('all_change_poll'):
          this.blu_station.bluRadiosAllChangePoll(cmd)
          this.setBluReceiverState(cmd)
          break
        case ('toggle_blu'):
          if (cmd.data.type === 'blu_on') {
            this.blu_station.bluRadioOn(cmd)
            this.setBluRadioState(cmd)
          } else if (cmd.data.type === "blu_off") {
            this.blu_station.bluRadioOff(cmd)
            this.setBluRadioState(cmd)
          }
          break
        case ('toggle_blu_led'):

          this.blu_station.bluLed(cmd)

          break
        case ('reboot_blu_radio'):
          this.blu_station.bluReboot(cmd)
          break
        case ('change_poll'):
          this.blu_station.bluChangePoll(cmd)
          this.setBluRadioState(cmd)
          break
        case ('toggle_radio'):
          let channel = cmd.data.channel
          this.toggleRadioMode({
            channel: channel,
            mode: cmd.data.type
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

  getRadioFirmware() {
    return Object.keys(this.radio_fw)
      .map((channel) => ({
        channel: channel,
        version: this.radio_fw[channel],
      }))
  }

  /**
   * checkin to the server
   */
  checkin() {
    this.stationLog('server checkin initiated')
    this.server_api.healthCheckin(
      this.data_manager.stats.stats,
      this.getRadioFirmware(),
      this.data_manager.stats.blu_stats,
      this.blu_station.getBluFirmware()
    )
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
      .on('add', path => {
        this.addPath(path)
      })
      .on('unlink', path => {
        this.unlinkPath(path)
      })

    process.on('SIGINT', () => {
      console.log('sigint blu station blu receivers', this.blu_station.blu_receivers)
      // const promises = this.blu_station.blu_receivers.map((receiver) => {
      const promises = this.blu_station.blu_receivers.map((receiver) => {
        if (receiver.path) {

          this.toggleBluState({
            receiver_channel: receiver.port,
            radio_state: 0,
          })

          this.blu_station.stopBluRadios(receiver.path)
          this.blu_station.destroy_receiver(receiver)
        }
      })
      try {
        const blu_radios_stop = Promise.all(promises)
        this.blu_station.destroy_station()
      } catch (e) {
        console.error('no port to closed in destroyed blu receiver', e)
        try {
          blu_radios_stop(promises)
          process.exit(0)
        } catch (e) {
          console.error('what the hell is happening', e)
          this.blu_station.destroy_station()
          process.exit(0)
        }
      } finally {
        setTimeout(() => {
          process.exit(0)
        }, 5000)
      }
    })
  }

  /**
   * 
   * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter connected to bluseries receiver
   */
  addPath(path) {
    if (revision.revision >= 3) {
      // V3 Radio Paths
      if (!path.includes('0:1.2.') && path.includes('-port0')) {

        this.startBluStation(path)

      } else if (!path.includes('-port0')) {
        this.startRadios(path)
      }
    } else {
      // V2 Radio Paths
      if (path.includes('-port0')) {

        this.startBluStation(path)

      } else if (!path.includes('-port0')) {
        this.startRadios(path)
      }
    }
  }

  /**
 * 
 * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter connected to bluseries receiver
 */
  unlinkPath(path) {
    if (revision.revision >= 3) {
      // V3 Radio paths
      if (!path.includes('0:1.2.') && path.includes('-port0')) {
        this.unlinkBluStation(path)
      } else if (!path.includes('-port0')) {
        this.unlinkDongleRadio(path)
      }
    } else {
      // V2 Radio Paths
      if (path.includes('-port0')) {
        this.unlinkBluStation(path)
      } else if (!path.includes('-port0')) {
        this.unlinkDongleRadio(path)
      }
    }
  }

  /**
   * 
   * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter connected to bluseries receiver
   */
  startBluStation(path) {

    this.blu_station.startBluRadios(path.substring(17))
    let start_receiver = this.findBluReceiveryByPath(path)
    let add_port = {
      msg_type: 'add_port',
      port: start_receiver.port
    }
    this.broadcast(JSON.stringify(add_port))
    start_receiver.blu_radios.forEach((radio) => {
      this.toggleBluState({
        receiver_channel: start_receiver.port,
        blu_radio_channel: radio.radio,
        radio_state: 1,
        poll_interval: radio.poll_interval,
      })
    })
  }

  /**
   * 
   * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter for bluseries receiver
   */
  unlinkBluStation(path) {
    let unlink_receiver = this.blu_receivers.find(receiver => receiver.path === path.substring(17))
    let unlink_port = unlink_receiver.channel
    let unlink_obj = {
      msg_type: "unlink_port",
      port: unlink_port,
    }
    this.broadcast(JSON.stringify(unlink_obj))
    this.blu_station.stopBluRadios(path.substring(17))
    unlink_receiver.blu_radios.forEach((radio) => {

      this.toggleBluState({
        receiver_channel: unlink_port,
        radio_state: 0,
        blu_radio_channel: radio.radio,
        poll_interval: radio.poll_interval,
      })
    })
    this.blu_station.destroy_receiver(unlink_receiver)
  }

  /**
 * 
 * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter for bluseries receiver
 */
  unlinkDongleRadio(path) {
    let unlink_dongle = {
      msg_type: "unlink_dongle",
      path: path.substring(17),
      port: this.dongle_port,
    }
    this.broadcast(JSON.stringify(unlink_dongle))
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
   * start the radio receiversblu_stations
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

  /**
 * 
 * @param {String} path 
 * @returns 
 */
  findBluReceiveryByPath(path) {
    let receiver = this.blu_station.blu_receivers.find(receiver => receiver.path === path.substring(17))
    return receiver
  }

  /**
   * @param {Object} cmd Websocket command object
   * @param {Object} cmd.data Data object containing port number, and blu radio configurations
   * @param {String} cmd.data.port Port number in string format
   * @param {String} cmd.data.poll_interval Polling interval for the radio
   * @param {String} cmd.data.scan Scan variable, determines if radios is scanning for tags, using for radio state
   */
  setBluReceiverState(cmd) {
    let receiver_channel = Number(cmd.data.port)
    if (cmd.data.poll_interval) {
      let poll_interval = Number(cmd.data.poll_interval)
      let radio_state = Number(cmd.data.scan)
      this.toggleBluState({ receiver_channel, poll_interval, radio_state })
    } else {
      let radio_state = Number(cmd.data.scan)
      this.toggleBluState({ receiver_channel, radio_state })
    }
  }

  /**
 * @param {Object} cmd Websocket command object
 * @param {Object} cmd.data Data object containing port number, and blu radio configurations
 * @param {String} cmd.data.port Port number in string format
 * @param {String} cmd.data.channel Radio channel on the receiver
 * @param {String} cmd.data.poll_interval Polling interval for the radio
 * @param {String} cmd.data.scan Scan variable, determines if radios is scanning for tags, using for radio state
 */
  setBluRadioState(cmd) {
    let receiver_channel = Number(cmd.data.port)
    let blu_radio_channel = Number(cmd.data.channel)
    if (cmd.data.poll_interval) {
      let poll_interval = Number(cmd.data.poll_interval)
      let radio_state = cmd.data.scan ? Number(cmd.data.scan) : 1
      this.toggleBluState({ receiver_channel, blu_radio_channel, poll_interval, radio_state })
    } else {
      let radio_state = cmd.data.scan ? Number(cmd.data.scan) : 1
      this.toggleBluState({ receiver_channel, blu_radio_channel, radio_state })
    }
  }


} // end of base station class

export { BaseStation }
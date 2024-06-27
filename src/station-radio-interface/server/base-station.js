import { RadioReceiver } from './radio-receiver.js'
import BluStation from './blu-base-station.js'
import BluLeds from '../../hardware/bluseries-receiver/driver/leds.js'

import { SensorSocketServer } from './http/web-socket-server.js'
import { GpsClient } from './gps-client.js'
import { StationConfig } from './station-config.js'
import { DataManager } from './data/data-manager.js'
import { ServerApi } from './http/server-api.js'
import StationLeds from './led/station-leds.js'
import fetch from 'node-fetch'
import { spawn } from 'child_process'
import heartbeats from 'heartbeats'
import path from 'path'
import _ from 'lodash'
import moment from 'moment'
import chokidar from 'chokidar'
import System from '../../system.js'

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
    let base_log_dir = this.config.data.record.base_log_directory

    this.data_manager = new DataManager({
      id: System.Hardware.Id,
      base_log_dir: base_log_dir,
      date_format: this.date_format,
      flush_data_cache_seconds: this.config.data.record.flush_data_cache_seconds
    })

    this.log_filename = `sensor-station-${System.Hardware.Id}.log`
    this.log_file_uri = path.join(base_log_dir, this.log_filename)

    this.gps_client.start()
    this.stationLog('initializing base station')
    this.startWebsocketServer()

    this.blu_station = new BluStation({
      blu_receivers: JSON.parse(JSON.stringify(this.blu_receivers)),
      data_manager: this.data_manager,
      broadcast: this.broadcast,
      websocket: this.sensor_socket_server,
      blu_firmware: this.firmware,
      server_api: this.server_api,
      config: this.config,
    })
    this.blu_station.startBluWebsocketServer()
    await this.directoryWatcher()
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
      const radio = this.active_radios[opts.channel]
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
    // console.log('toggle blu state', opts)
    await this.config.toggleBluRadio({
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
    this.sensor_socket_server.on('cmd', async (cmd) => {
      switch (cmd.cmd) {
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
            .then(async (json) => {
              let data = json
              data.station_id = System.Hardware.Id
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
  async directoryWatcher() {
    chokidar.watch('/dev/serial/by-path')
      .on('add', async path => {
        await this.addPath(path)
        this.stationLog(`${path} was added`)
      })
      .on('unlink', async path => {
        await this.unlinkPath(path)
        this.stationLog(`${path} was removed`)

      })

    process.on('SIGINTx', async () => {
      console.log('sigint, manually closing down program')
      const promises = this.blu_station.blu_receivers.map(async (receiver) => {
        if (receiver.path) {
          receiver.blu_radios.forEach(async (radio) => {
            await this.toggleBluState({
              receiver_channel: receiver.port,
              blu_radio_channel: radio.radio,
              poll_interval: radio.poll_interval,
              radio_state: BluLeds.state.off,
            })
          })
          this.stationLog(`blu receiver ${receiver.port} turned off`)
          // await this.blu_station.stopBluRadios(receiver.path)
          await this.blu_station.destroy_receiver(receiver)
        }
      })
      try {
        await Promise.all(promises)
      } catch (e) {
        console.error('no port to closed in destroyed blu receiver', e)
        try {
          blu_radios_stop(promises)
          process.exit(0)
        } catch (e) {
          console.error('what the hell is happening', e)
          process.exit(0)
        }
      } finally {
        setTimeout(() => {
          process.exit(0)
        }, 5000)
      }
    })

    process.on('exit', async () => {
      console.log('sigint, manually closing down program')
      const promises = this.blu_station.blu_receivers.map(async (receiver) => {
        console.log('receiver path', receiver.path)
        if (receiver.path) {
          receiver.blu_radios.forEach(async (radio) => {

            await this.toggleBluState({
              receiver_channel: receiver.port,
              blu_radio_channel: radio.radio,
              poll_interval: radio.poll_interval,
              radio_state: BluLeds.state.off,
            })

          })
          // await this.blu_station.stopBluRadios(receiver.path)
          await this.blu_station.destroy_receiver(receiver)
        }
      })
      try {
        await Promise.all(promises)
      } catch (e) {
        console.error('no port to closed in destroyed blu receiver', e)
        try {
          blu_radios_stop(promises)
          process.exit(0)
        } catch (e) {
          console.error('what the hell is happening', e)
          // process.exit(0)
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
  async addPath(path) {
    if (System.Hardware.Version >= 3) {
      // V3 Radio Paths
      if (!path.includes('0:1.2.') && path.includes('-port0')) {
        await this.startBluStation(path)
        this.stationLog('starting blu receiver')
      } else if (!path.includes('-port0')) {
        this.startRadios(path)
      }
    } else {
      // V2 Radio Paths
      if (path.includes('-port0')) {
        await this.startBluStation(path)
        this.stationLog('starting blu receiver')
      } else if (!path.includes('-port0')) {
        this.startRadios(path)
      }
    }
  }

  /**
 * 
 * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter connected to bluseries receiver
 */
  async unlinkPath(path) {
    if (System.Hardware.Version >= 3) {
      // V3 Radio paths
      if (!path.includes('0:1.2.') && path.includes('-port0')) {
        await this.unlinkBluStation(path)
        this.stationLog('removed blu receiver')

      } else if (!path.includes('-port0')) {
        await this.unlinkDongleRadio(path)
      }
    } else {
      // V2 Radio Paths
      if (path.includes('-port0')) {
        await this.unlinkBluStation(path)
        this.stationLog('removed blu receiver')

      } else if (!path.includes('-port0')) {
        await this.unlinkDongleRadio(path)
      }
    }
  }

  /**
   * 
   * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter connected to bluseries receiver
   */
  async startBluStation(path) {

    await this.blu_station.startBluRadios(path)
    const receiver_to_start = this.findBluReceiveryByPath(path)

    receiver_to_start.blu_radios.forEach(async (radio) => {
      const { poll_interval, radio: radio_channel, } = radio
      this.broadcast(JSON.stringify({
        msg_type: 'add_port',
        poll_interval: poll_interval,
        port: receiver_to_start.port
      }))
      this.stationLog(`starting blu radios ${radio_channel} on USB Port ${receiver_to_start.port}`)

      await this.toggleBluState({
        receiver_channel: receiver_to_start.port,
        blu_radio_channel: radio.radio,
        radio_state: BluLeds.state.on,
        poll_interval: radio.poll_interval,
      })
      setInterval(() => {
        if (receiver_to_start.port !== undefined) {
          this.stationLog(`blu radio ${radio_channel} is running on USB Port ${receiver_to_start.port}`)
          console.log(`blu radio ${radio_channel} is running on USB Port ${receiver_to_start.port}`)
        }
      }, 300000)
    })
  }

  /**
   * 
   * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter for bluseries receiver
   */
  async unlinkBluStation(path) {
    let receiver_to_unlink = this.blu_station.blu_receivers.find(receiver => receiver.path === path)
    // let unlink_port = unlink_receiver.channel
    let unlink_port = receiver_to_unlink.port
    let unlink_obj = {
      msg_type: "unlink_port",
      port: unlink_port,
    }
    this.broadcast(JSON.stringify(unlink_obj))
    receiver_to_unlink.blu_radios.forEach(async (radio) => {
      // const { poll_interval, radio: radio_channel, } = radio

      await this.toggleBluState({
        receiver_channel: unlink_port,
        radio_state: BluLeds.state.off,
        blu_radio_channel: radio.radio,
        poll_interval: radio.poll_interval,
      })
    })
    // this.blu_station.stopBluRadios()
    await this.blu_station.destroy_receiver(receiver_to_unlink)
    console.log('unlink receiver after destruction', receiver_to_unlink)
  }

  /**
 * 
 * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter for bluseries receiver
 */
  async unlinkDongleRadio(path) {
    let unlink_dongle = {
      msg_type: "unlink_dongle",
      path: path,
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
    return this.config.data.radios.find(radio => radio.path == path)
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
    return this.blu_station.blu_receivers.find(receiver => receiver.path === path)
  }
} // end of base station class

export { BaseStation }
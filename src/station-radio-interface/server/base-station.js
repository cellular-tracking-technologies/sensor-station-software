import { RadioReceiver } from './radio-receiver.js'
import { BluStation, BluStations } from './blu-base-station.js'
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
import chokidar from 'chokidar'
// import blu_radios from '../../../system/radios/v2-blu-radio-map.js'
import revision from '../../revision.js'

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
    // console.log('base station config', this.config)
    // this.blu_radios = this.config.default_config.blu_radios
    // this.blu_radios = blu_radios
    this.blu_reader
    // this.blu_station
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
    this.dongle_port
    this.blu_stations = new BluStations()
    this.blu_config
    this.blu_radio_filemap

  }

  createBluConfig() {
    if (revision.revision >= 3) {
      this.blu_radio_filemap = '/lib/ctt/sensor-station-software/system/radios/v3-blu-radio-map.js'
    } else {
      this.blu_radio_filemap = '/lib/ctt/sensor-station-software/system/radios/v2-blu-radio-map.js'
    }
    this.blu_config = new StationConfig({
      config_filepath: '/etc/ctt/station-config.json',
      radio_map_filepath: this.blu_radio_filemap,
    })
    this.blu_config.load()
    // this.blu_config.save()

    // return this.blu_config
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
    // console.log('base station config in init function', this.config)
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
    this.createBluConfig()
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
        case ('blu_radio_all_on'):
          // let all_on_port = cmd.data.port
          let all_on_index = this.blu_stations.getAllBluStations.findIndex(receiver => receiver.port === Number(cmd.data.port))
          let all_on_blustation = this.blu_stations.getAllBluStations[all_on_index]
          console.log('all on blu station', all_on_blustation)
          const radios_on = Promise.all(all_on_blustation.blu_receivers.blu_radios.map(radio => {
            radio.poll_interval = Number(cmd.data.poll_interval)
            this.blu_receivers[all_on_index] = all_on_blustation
            all_on_blustation.updateConfig(all_on_blustation, radio.radio, cmd.data.poll_interval)
            all_on_blustation.radioOn(radio.radio, cmd.data.poll_interval)

          })).then((values) => {
            console.log('all radios on', values)
          }).catch((e) => {
            console.error('all radios on error', e)
          })
          break;
        case ('blu_radio_all_off'):
          let all_off_index = this.blu_stations.getAllBluStations.findIndex(receiver => receiver.port === Number(cmd.data.port))
          let all_off_blustation = this.blu_stations.getAllBluStations[all_off_index]
          const radios_off = Promise.all(all_off_blustation.blu_receivers.blu_radios.map(radio => {
            console.log('blu radio all off radio', radio)
            all_off_blustation.radioOff(radio)
          })).then((values) => {
            console.log('turning blu radio off', values)
          }).catch((e) => {
            console.error('all radios off error', e)
          })
          break
        case ('blu_led_all'):
          let all_led_index = this.blu_stations.getAllBluStations.findIndex(receiver => receiver.port === Number(cmd.data.port))
          let all_led_blustation = this.blu_stations.getAllBluStations[all_led_index]

          const all_leds = Promise.all(all_led_blustation.blu_receivers.blu_radios.map(radio => {
            all_led_blustation.setBluConfig(Number(radio.radio), { scan: cmd.data.scan, rx_blink: cmd.data.rx_blink, })
          })).then((values) => {
            console.log('turning radio leds on', values)
          }).catch((e) => {
            console.log('cannot turn radio leds on', e)
          })
          break
        case ('blu_reboot_all'):
          console.log('blu reboot all cmd', cmd)
          let reboot_index_all = this.blu_stations.getAllBluStations.findIndex(receiver => receiver.port === Number(cmd.data.port))
          let all_reboot_blustation = this.blu_stations.getAllBluStations[reboot_index_all]

          const all_reboot = Promise.all(all_reboot_blustation.blu_receivers.blu_radios.map(radio => {
            radio.poll_interval = 10000
            console.log('all reboot radio', radio)
            this.blu_receivers[reboot_index_all] = all_reboot_blustation
            all_reboot_blustation.updateConfig(all_reboot_blustation, radio.radio, radio.poll_interval)

            this.poll_data = {
              channel: radio.radio,
              poll_interval: radio.poll_interval,
              msg_type: 'poll_interval',
            }

            all_reboot_blustation.broadcast(JSON.stringify(this.poll_data))
            all_reboot_blustation.rebootBluReceiver(radio, this.poll_data.poll_interval)
            // this.updateConfig(this.blu_receivers)

          })).then((values) => {
            console.log('all radios rebooting', values)
          }).catch((e) => {
            console.error('all radios reboot error', e)
          })

          break
        case ('all_change_poll'):
          let change_poll_all_port = cmd.data.port.toString()
          let change_poll_all_index = this.findBluPort(change_poll_all_port)

          this.poll_interval = Number(cmd.data.poll_interval)

          // set current poll interval in default-config
          let radios_all_poll = Promise.all(Object.keys(this.blu_receivers[change_poll_all_index].blu_radios).forEach((radio) => {
            this.blu_receivers[change_poll_all_index].blu_radios[radio].values.current = this.poll_interval
            this.poll_data = {
              port: cmd.data.port,
              channel: radio,
              poll_interval: this.poll_interval,
              msg_type: 'poll_interval',
            }

            this.updateConfig(this.blu_receivers)

            this.broadcast(JSON.stringify(this.poll_data))

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
          let update_all_index = this.findBluPort(cmd.data.port)

          const blu_update_all = Promise.all(Object.keys(this.blu_receivers[update_all_index].blu_radios).forEach((radio) => {
            let current_poll_interval = this.blu_receivers[update_all_index].blu_radios[radio].values.current
            this.updateBluFirmware(Number(radio), this.firmware, current_poll_interval)
          })).then((values) => {
            console.log('turning blu radio off', values)
          }).catch((e) => {
            console.error(`Can't update all radios on port ${cmd.data.port}`)
          })
          break
        case ('toggle_blu'):

          if (cmd.data.type === 'blu_on') {
            console.log('turning blu radio on')
            let br_index = this.findBluPort(cmd.data.port)
            let radio_on = cmd.data.channel

            this.blu_receivers[br_index].blu_radios[Number(radio_on)].values.current = Number(cmd.data.poll_interval)
            this.updateConfig(this.blu_receivers)
            this.radioOn(Number(radio_on), cmd.data.poll_interval)

          } else if (cmd.data.type === "blu_off") {
            let br_index = this.findBluPort(cmd.data.port)
            let radio_off = cmd.data.channel
            this.radioOff(radio_off.toString())
          }
          break
        case ('toggle_blu_led'):
          let ledon_radio = cmd.data.channel
          this.setBluConfig(Number(ledon_radio), { scan: cmd.data.scan, rx_blink: cmd.data.rx_blink, })
          break
        case ('reboot_blu_radio'):
          let reboot_index = this.findBluPort(cmd.data.port)
          let reboot_port = cmd.data.port
          let reboot_radio = cmd.data.channel
          let default_poll = this.blu_receivers[reboot_port].blu_radios[reboot_radio].values.default
          this.blu_receivers[reboot_index].blu_radios[reboot_radio].values.current = default_poll

          this.poll_data = {
            channel: reboot_radio,
            poll_interval: this.blu_receivers[reboot_index].blu_radios[reboot_radio].values.default,
            msg_type: 'poll_interval',
          }
          this.broadcast(JSON.stringify(this.poll_data))
          this.updateConfig(this.blu_receivers)
          this.rebootBluReceiver(Number(reboot_radio), this.poll_data.poll_interval)
          break
        case ('change_poll'):
          let br_index = this.findBluPort(cmd.data.port)
          let poll_radio = cmd.data.channel
          this.poll_interval = Number(cmd.data.poll_interval)
          this.blu_receivers[br_index].blu_radios[poll_radio].values.current = this.poll_interval
          this.poll_data = {
            port: cmd.data.port,
            channel: poll_radio,
            poll_interval: this.poll_interval,
            msg_type: 'poll_interval',
          }
          this.updateConfig(this.blu_receivers)
          this.broadcast(JSON.stringify(this.poll_data))
          this.stopDetections(Number(poll_radio))
          this.setBluConfig(Number(poll_radio), { scan: 1, rx_blink: 1, })
          this.getDetections(Number(poll_radio), this.poll_interval)
          // })
          break
        case ('update-blu-firmware'):
          let update_index = this.findBluPort(cmd.data.port)
          let update_radio = cmd.data.channel
          let poll_interval = this.blu_receivers[update_index].blu_radios[update_radio].values.current
          this.updateBluFirmware(Number(update_radio), this.firmware, poll_interval)
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
      .on('add', path => {
        // console.log('chokidar path', path)
        this.addPath(path)
      })
      .on('unlink', path => {
        this.unlinkPath(path)
      })

    process.on('SIGINT', () => {

      console.log("\nGracefully shutting down from SIGINT (Ctrl-C)")
      const blu_stations_exit = Promise.all(this.blu_stations.getAllBluStations
        .map((station) => {
          station.destroy_receiver()
        })).then((values) => {
          console.log(values)
        }).catch((e) => {
          console.error('no port to closed in destroyed blu receiver', e)
        })

      setTimeout(() => {
        console.log('Closed blu readers', this.blu_stations.getAllBluStations)
        process.exit(0)
      }, 7000)
    })
  }

  addPath(path) {
    if (revision.revision >= 3) {
      // V3 Radio Paths
      if (!path.includes('0:1.2.') && path.includes('-port0')) {

        this.startBluStations(path)

      } else if (!path.includes('-port0')) {
        this.startRadios(path)
      }
    } else {
      // V2 Radio Paths
      if (path.includes('-port0')) {

        this.startBluStations(path)

      } else if (!path.includes('-port0')) {
        this.startRadios(path)
      }
    }
  }

  unlinkPath(path) {
    if (revision.revision >= 3) {
      // V3 Radio paths
      if (!path.includes('0:1.2.') && path.includes('-port0')) {

        this.unlinkBluStations(path)

      } else if (!path.includes('-port0')) {
        this.unlinkDongleRadio(path)

      }
    } else {
      // V2 Radio Paths
      if (path.includes('-port0')) {

        this.unlinkBluStations(path)

      } else if (!path.includes('-port0')) {
        this.unlinkDongleRadio(path)
      }
    }
  }

  startBluStations(path) {
    let blu_receiver_index = this.blu_receivers.findIndex(receiver => receiver.path === path.substring(17))
    console.log('startBluStations blu receiver', this.blu_receivers[blu_receiver_index])
    console.log('blu config', this.blu_config)

    this.blu_stations.newBluStation({
      path: path,
      blu_receivers: this.blu_receivers[blu_receiver_index],
      data_manager: this.data_manager,
      broadcast: this.broadcast,
      websocket: this.sensor_socket_server,
    })

    let add_index = this.findBluPath(path)
    this.blu_stations.getAllBluStations[add_index].startBluRadios(path)
    // this.blu_stations.getAllBluStations[add_index].startWebsocketServer()
  }

  unlinkBluStations(path) {
    let unlink_index = this.blu_stations.getAllBluStations.findIndex(receiver => receiver.path === path.substring(17))
    let unlink_obj = this.blu_receivers.find(receiver => receiver.path === path.substring(17))
    let unlink_port = unlink_obj.channel
    let unlink_receiver = {
      msg_type: "unlink_port",
      port: unlink_port,
    }
    this.broadcast(JSON.stringify(unlink_receiver))
    this.blu_stations.getAllBluStations[unlink_index].stopBluRadios(path)
    this.blu_stations.getAllBluStations[unlink_index].destroy_receiver()
    console.log('destroyed blu station', this.blu_stations.getAllBluStations[unlink_index])
  }

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

  /**
 * 
 * @param {String} path 
 * @returns 
 */
  findBluPath(path) {
    let index = this.blu_stations.getAllBluStations.findIndex(receiver => receiver.path === path)
    console.log('findBluPath index', index)
    return index
  }


} // end of base station class

export { BaseStation }
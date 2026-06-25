import { RadioReceiver } from './radio-receiver.js'
import BluStation from './blu-base-station.js'
import BluLeds from '../../hardware/ctt/bluseries-receiver/driver/leds.js'

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
import fs from 'fs'

// USB identifiers of BluSeries receivers. The chokidar watcher on
// /dev/serial/by-path/ picks up any USB serial device — modem CDC ACM ports,
// debug adapters, the 434 MHz Feathers, etc. — so we positively identify the
// BluSeries FTDI adapters here and ignore everything else.
//
// The 434 MHz Feather radios (Adafruit VID 239a) are NO LONGER discovered here:
// they are served by ctt-radio-driver over /run/ctt/radios/ch<N>.sock and
// attached by radioSocketWatcher(). Leaving 239a out of the filter is what makes
// this chokidar path Blu-only — isRadio() returns false for a Feather, so
// addPath() skips it.
//
// RADIO_VID_PIDS — match a specific VID:PID pair
const RADIO_VID_PIDS = new Set([
  '0403:6015', // FTDI FT231X — BluSeries receivers (kept narrow to avoid
               // matching other FTDI chips used as debug serial adapters)
])

// Directory where each ctt-radio-driver@ch<N> instance serves its socket.
const RADIO_SOCKET_DIR = '/run/ctt/radios'

// Directory where each ctt-blu-driver@ch<N> instance serves its socket. Same
// gpsd-style transport as the radios; the BluSeries protocol layer (BluStation)
// consumes the socket in place of a direct serial port.
const BLU_SOCKET_DIR = '/run/ctt/blu'

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
    this.active_blu = {}
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
    this.station_id = System.Hardware.Id
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
    // console.log('radio interface system id', System.Hardware.Id)

    // const chip_id = await IdDriver.FromChip()
    // const file_id = IdDriver.FromFile()
    // console.log('chip id', chip_id, 'file id', file_id)

    await this.config.load()
    /** DO NOT MERGE DEFAULT CONFIG for now...
    // merge default config with current config if fields have been added
    // this.config.data = _.merge(this.config.default_config, this.config.data)
    */

    // save the config to disk
    this.config.save()

    // get station id from hardware server

    this.data_manager = new DataManager({
      // id: System.Hardware.Id,
      id: this.station_id,
      base_log_dir: this.config.data.record.base_log_directory,
      date_format: this.config.data.record.date_format,
      flush_data_cache_seconds: this.config.data.record.flush_data_cache_seconds
    })

    console.log('radio interface station id', this.station_id)
    console.log('data manager station id', this.data_manager.id)
    this.blu_receivers = this.config.data.blu_receivers

    // this.log_filename = `sensor-station-${System.Hardware.Id}.log`
    this.log_filename = `sensor-station-${this.station_id}.log`
    this.log_file_uri = path.join(this.config.data.record.base_log_directory, this.log_filename)

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
    // BluSeries receivers are discovered via ctt-blu-driver sockets (mirrors the
    // radios), not the legacy chokidar /dev/serial/by-path watcher.
    await this.bluSocketWatcher()
    await this.radioSocketWatcher()
    this.startTimers()
  }

  /**
   * 
   * @param {Object} opts 
   * @param {Number} opts.channel
   * @param {String} opts.mode
   */
  toggleRadioMode(opts) {
    if (Object.keys(this.active_radios).includes(opts.channel)) {
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
          console.log('channel', channel, 'mode', cmd.data.type)
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
              // data.station_id = System.Hardware.Id
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
          console.log('server checkin false')

        }
      })
      .catch((err) => {
        this.stationLog('server checkin error', err.toString())
        console.log('server checkin error', err.toString())
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

    // this.heartbeat.createEvent(0.083 * 60, this.checkStationId.bind(this))

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
    msgs.unshift(moment(new Date()).utc().format(this.config.data.record.date_format))
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
   * Identify whether a /dev/serial/by-path/ link points at a known
   * CTT radio receiver (Adafruit Feather MCU or FTDI FT231X BluSeries).
   * Anything not matching — modem CDC ACM, debug serial adapters,
   * future USB serial devices we haven't whitelisted — is skipped.
   *
   * Walks the symlink to the underlying ttyACMx or ttyUSBx device, then
   * reads idVendor / idProduct from the device's USB parent in sysfs.
   * Returns false on any I/O error (safer default: skip when in doubt
   * rather than risk opening a non-radio port as a radio).
   *
   * @param {String} byPathLink full /dev/serial/by-path/* path
   * @returns {Promise<boolean>}
   */
  async isRadio(byPathLink) {
    try {
      const target = await fs.promises.readlink(byPathLink)         // e.g. '../../ttyACM4'
      const devName = path.basename(target)                          // 'ttyACM4'
      const usbParent = `/sys/class/tty/${devName}/device/..`
      const vid = (await fs.promises.readFile(`${usbParent}/idVendor`, 'utf8')).trim()
      const pid = (await fs.promises.readFile(`${usbParent}/idProduct`, 'utf8')).trim()
      // BluSeries FTDI only — Feathers (239a) are handled by the socket watcher.
      return RADIO_VID_PIDS.has(`${vid}:${pid}`)
    } catch (err) {
      console.log(`isRadio: sysfs lookup failed for ${byPathLink}: ${err.message}`)
      return false
    }
  }

  /**
   *
   * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter connected to bluseries receiver
   */
  async addPath(path) {
    if (!(await this.isRadio(path))) {
      console.log('addPath: skipping non-radio device', path)
      return
    }
    // Blu-only: the 434 MHz Feather radios are attached by radioSocketWatcher()
    // from /run/ctt/radios/*.sock. This chokidar path handles BluSeries (FTDI)
    // receivers, which present as -port0 devices.
    if (System.Hardware.Version >= 3) {
      // V3 Blu paths
      if (!path.includes('0:1.2.') && path.includes('-port0')) {
        console.log('starting blu station')
        await this.startBluStation(path)
        this.stationLog('starting blu receiver')
      }
    } else {
      // V2 Blu paths
      if (path.includes('-port0') && !path.includes('0:1.2.1:1')) {
        await this.startBluStation(path)
        this.stationLog('starting blu receiver')
      }
    }
  }

  /**
   *
   * @param {String} path full path from /dev/serial/by-path that corresponds to usb adapter connected to bluseries receiver
   *
   * Note: we can't re-check VID:PID on unlink because the sysfs entry is gone
   * by the time chokidar fires the event; non-Blu unlinks (modem, Feather)
   * simply match no branch below and are ignored.
   */
  async unlinkPath(path) {
    // Blu-only: 434 sockets are torn down by stopRadioSocket() on their
    // /run/ctt/radios/*.sock unlink event, not here.
    if (System.Hardware.Version >= 3) {
      // V3 Blu paths
      if (!path.includes('0:1.2.') && path.includes('-port0')) {
        await this.unlinkBluStation(path)
        this.stationLog('removed blu receiver')
      }
    } else {
      // V2 Blu paths
      if (path.includes('-port0') && !path.includes('0:1.2.1:1')) {
        await this.unlinkBluStation(path)
        this.stationLog('removed blu receiver')
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
        blu_channel: radio_channel,
        poll_interval: poll_interval,
        port: receiver_to_start.port,
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
   * Discover ctt-radio-driver sockets by RECONCILIATION rather than filesystem
   * events: the /run/ctt/radios directory is the source of truth. On each tick
   * we diff the ch<N>.sock files against the attached receivers — attach the
   * new, detach the vanished. This is robust where an event-watch is not: unix
   * socket special files aren't reliably reported by chokidar/inotify wrappers,
   * and a reconcile self-heals from any missed event and picks up a radio that
   * first appears AFTER this process started.
   *
   * Orthogonally, each RadioReceiver reconnects itself (restart_on_close), which
   * covers a driver that restarts in place — e.g. a binary update — and briefly
   * removes+recreates the same socket between reconcile ticks.
   */
  async radioSocketWatcher() {
    await this.reconcileRadioSockets()
    this.radio_socket_timer = setInterval(() => {
      this.reconcileRadioSockets().catch((err) => {
        console.error('radio socket reconcile error', err)
      })
    }, 3000)
  }

  /**
   * One reconcile pass: attach sockets that appeared, detach receivers whose
   * socket is gone. Idempotent.
   */
  async reconcileRadioSockets() {
    const present = {}
    try {
      const entries = await fs.promises.readdir(RADIO_SOCKET_DIR)
      entries.forEach((f) => {
        const m = f.match(/^ch(\d+)\.sock$/)
        if (m) present[parseInt(m[1], 10)] = path.join(RADIO_SOCKET_DIR, f)
      })
    } catch (err) {
      // dir absent until the first driver starts — treat as no sockets present.
    }
    // attach newly-present sockets
    Object.keys(present).forEach((channel) => {
      if (!this.active_radios[channel]) {
        this.startRadioSocket(present[channel])
      }
    })
    // detach receivers whose socket vanished
    Object.keys(this.active_radios).forEach((channel) => {
      if (!(channel in present)) {
        this.stopRadioSocket(path.join(RADIO_SOCKET_DIR, `ch${channel}.sock`))
      }
    })
  }

  /**
   * Parse the channel from a /run/ctt/radios/ch<N>.sock path.
   * @returns {Number|null}
   */
  channelFromSocket(socket_path) {
    const m = path.basename(socket_path).match(/^ch(\d+)\.sock$/)
    return m ? parseInt(m[1], 10) : null
  }

  /**
   * Attach a RadioReceiver to a driver socket. Channel comes from the socket
   * name; per-channel preset/mode still comes from config.data.radios.
   *
   * @param {String} socket_path full /run/ctt/radios/ch<N>.sock path
   */
  startRadioSocket(socket_path) {
    const channel = this.channelFromSocket(socket_path)
    if (channel === null) {
      console.log('ignoring non-channel socket', socket_path)
      return
    }
    if (this.active_radios[channel]) {
      // already attached (e.g. initial scan races the watcher's add event)
      return
    }
    this.stationLog(`attaching radio socket ch${channel}`)
    const radio_cfg = (this.config.data.radios || []).find((r) => r.channel == channel)
    const beep_reader = new RadioReceiver({
      socket_path: socket_path,
      channel: channel,
      baud_rate: 115200,
      restart_ms: 3000,   // quick reconnect for an in-place driver restart
    })
    beep_reader.on('beep', (beep) => {
      this.data_manager.handleRadioBeep(beep)
      beep.msg_type = 'beep'
      this.broadcast(JSON.stringify(beep))
    })
    beep_reader.on('radio-fw', (fw_version) => {
      this.radio_fw[channel] = fw_version
    })
    beep_reader.on('open', () => {
      this.stationLog('opened radio on channel', channel)
      if (radio_cfg && radio_cfg.config) {
        beep_reader.issueCommands(radio_cfg.config)
      }
    })
    beep_reader.on('write', (msg) => {
      this.stationLog(`writing message to radio ${msg.channel}: ${msg.msg}`)
    })
    beep_reader.on('error', (err) => {
      console.error(err)
      this.stationLog(`radio error on channel ${channel}  ${err}`)
    })
    beep_reader.on('close', () => {
      // RadioReceiver reconnects itself (restart_on_close) while the socket
      // exists; a vanished socket is handled by stopRadioSocket on unlink.
      this.stationLog(`radio socket closed ch${channel}`)
    })
    beep_reader.start(0)
    this.active_radios[channel] = beep_reader
  }

  /**
   * Detach the RadioReceiver for a vanished driver socket and stop its
   * reconnect attempts.
   *
   * @param {String} socket_path full /run/ctt/radios/ch<N>.sock path
   */
  stopRadioSocket(socket_path) {
    const channel = this.channelFromSocket(socket_path)
    if (channel === null) return
    const beep_reader = this.active_radios[channel]
    if (beep_reader) {
      this.stationLog(`detaching radio socket ch${channel}`)
      beep_reader.destroy()   // sets restart_on_close=false, closes transport
      delete this.active_radios[channel]
    }
  }

  /**
   * Discover ctt-blu-driver sockets the same way as the radios: reconcile the
   * /run/ctt/blu directory against the attached BluSeries receivers on a timer.
   * Robust to missed events and to a driver that first appears after startup.
   */
  async bluSocketWatcher() {
    await this.reconcileBluSockets()
    this.blu_socket_timer = setInterval(() => {
      this.reconcileBluSockets().catch((err) => {
        console.error('blu socket reconcile error', err)
      })
    }, 3000)
  }

  /**
   * One reconcile pass: attach Blu sockets that appeared, detach receivers whose
   * socket vanished. Idempotent.
   */
  async reconcileBluSockets() {
    const present = {}
    try {
      const entries = await fs.promises.readdir(BLU_SOCKET_DIR)
      entries.forEach((f) => {
        const m = f.match(/^ch(\d+)\.sock$/)
        if (m) present[parseInt(m[1], 10)] = path.join(BLU_SOCKET_DIR, f)
      })
    } catch (err) {
      // dir absent until the first blu driver starts — treat as no sockets.
    }
    Object.keys(present).forEach((channel) => {
      if (!this.active_blu[channel]) this.startBluSocket(present[channel])
    })
    Object.keys(this.active_blu).forEach((channel) => {
      if (!(channel in present)) {
        this.stopBluSocket(path.join(BLU_SOCKET_DIR, `ch${channel}.sock`))
      }
    })
  }

  /**
   * Parse the channel from a /run/ctt/blu/ch<N>.sock path.
   * @returns {Number|null}
   */
  channelFromBluSocket(socket_path) {
    const m = path.basename(socket_path).match(/^ch(\d+)\.sock$/)
    return m ? parseInt(m[1], 10) : null
  }

  /**
   * Attach a BluSeries receiver to a driver socket. The channel comes from the
   * socket name; BluStation pulls the per-receiver radio config (blu_radios) from
   * config.data.blu_receivers keyed by that channel.
   *
   * @param {String} socket_path full /run/ctt/blu/ch<N>.sock path
   */
  async startBluSocket(socket_path) {
    const channel = this.channelFromBluSocket(socket_path)
    if (channel === null) {
      console.log('ignoring non-channel blu socket', socket_path)
      return
    }
    if (this.active_blu[channel]) return
    this.stationLog(`attaching blu socket ch${channel}`)
    // Mark active before the (async) attach so a concurrent reconcile tick does
    // not double-attach.
    this.active_blu[channel] = true
    let receiver
    try {
      receiver = await this.blu_station.startBluRadios(socket_path, channel)
    } catch (e) {
      console.error(`blu socket attach error ch${channel}`, e)
      delete this.active_blu[channel]
      this.blu_station.removeReceiver(channel).catch(() => {})
      return
    }
    if (!receiver) {
      // no config for this channel — release the slot
      delete this.active_blu[channel]
      return
    }
    // Persist each radio's on-state in config (mirrors the legacy attach path).
    receiver.blu_radios.forEach((radio) => {
      this.toggleBluState({
        receiver_channel: channel,
        blu_radio_channel: radio.radio,
        poll_interval: radio.poll_interval,
        radio_state: BluLeds.state.on,
      })
    })
    // On transport close (e.g. an in-place driver restart that recreates the
    // socket faster than a reconcile tick) drop tracking so the next reconcile
    // attaches a fresh receiver.
    receiver.on('close', () => {
      this.stationLog(`blu socket closed ch${channel}`)
      delete this.active_blu[channel]
      this.blu_station.removeReceiver(channel).catch((e) => console.error('blu remove error', e))
    })
  }

  /**
   * Detach the BluSeries receiver for a vanished driver socket.
   * @param {String} socket_path full /run/ctt/blu/ch<N>.sock path
   */
  stopBluSocket(socket_path) {
    const channel = this.channelFromBluSocket(socket_path)
    if (channel === null) return
    if (!this.active_blu[channel]) return
    this.stationLog(`detaching blu socket ch${channel}`)
    delete this.active_blu[channel]
    this.blu_station.removeReceiver(channel).catch((e) => console.error('blu remove error', e))
  }

  /**
 * 
 * @param {String} path 
 * @returns 
 */
  findBluReceiveryByPath(path) {
    return this.blu_station.blu_receivers.find(receiver => receiver.path === path)
  }

}

export { BaseStation }
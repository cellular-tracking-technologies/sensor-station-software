import moment from 'moment'
import EventEmitter from 'events'

import DataReceiver from '../../hardware/ctt/atmega32u4_receiver.js'
import { SerialTransport, SocketTransport } from './radio-transports.js'

/* event emitter for a radio:   events
  beep  - parsed JSON document from radio
  raw   - radio output not JSON parsable
  open  - radio port opened
  close - radio closed / radio error

  Transport-agnostic: a RadioReceiver reaches its radio either by direct serial
  (opts.port_uri) or via a ctt-radio-driver unix socket (opts.socket_path). The
  decode (atmega32u4_receiver on each line), event emission, command writing and
  firmware polling are identical either way — only the byte plumbing differs
  (see radio-transports.js).
*/
class RadioReceiver extends EventEmitter {
  /**
   *
   * @param {*} opts
   * @param {String} [opts.port_uri]    serial device path (serial transport)
   * @param {String} [opts.socket_path] /run/ctt/radios/ch<N>.sock (socket transport)
   * @param {Number} [opts.baud_rate]
   * @param {Number|String} opts.channel
   */
  constructor(opts) {
    super()
    this.port_uri = opts.port_uri
    this.socket_path = opts.socket_path
    this.baud_rate = opts.baud_rate
    this.channel = opts.channel
    this.restart_ms = opts.restart_ms || 15000
    // default true; destroy() flips this to false to stop reconnecting
    this.restart_on_close = opts.restart_on_close ?? true
    this.transport = null
    // poll firmware every 10 minutes
    this.firmware_poll_period = 600
    this.polling_interval = null
    this.commands = []
    this.current_command = null
    this.delay = 0.25
    this.fw_version = null

    this.preset_commands = {
      node: "preset:node3",
      tag: "preset:fsktag",
      ook: "preset:ooktag",
      version: "version",
    }

    this.pollFirmware = this.pollFirmware.bind(this)
  }

  destroy() {
    this.cancel()
    this.restart_on_close = false
    this.stopPollingFirmware()
    try { this.transport?.close() } catch (e) { /* already gone */ }
    this.transport = null
  }

  pollFirmware() {
    this.issuePresetCommand('version')
  }

  startPollingFirmware() {
    console.log(`polling firmware at an interval of ${this.firmware_poll_period} seconds`)
    this.polling_interval = setInterval(this.pollFirmware, this.firmware_poll_period * 1000)
    this.pollFirmware()
  }

  stopPollingFirmware() {
    clearInterval(this.polling_interval)
  }

  /**
   *
   * @param {msg} msg to transmit:  prefix with tx:
   */
  tx(msg) {
    this.write('tx:' + msg.trim())
  }

  issuePresetCommand(cmd) {
    let write_cmd = this.preset_commands[cmd]
    if (write_cmd) {
      this.write(write_cmd)
    }
  }

  /**
   *
   * @param {list} cmds - array of commands to issue
   */
  issueCommands(cmds) {
    let n = 0
    cmds.forEach((cmd) => {
      n += 1
      setTimeout(this.write.bind(this), this.delay * n * 1000, cmd)
    })
  }

  /**
   *
   * @param {*} data - write given data (receiver wire format) to the radio
   */
  write(data) {
    if (data) { // data was coming in null...
      console.log(`${moment(new Date()).utc().format('YYYY-MM-DD HH:mm:ss')} writing to radio ${this.channel}:  ${data.trim()}`)
      // emit 'write' message with data to write / channel
      this.emit('write', {
        msg: data,
        channel: this.channel
      })
      try {
        this.transport.writeWire(data)
      } catch (err) {
        this.emit('error', `error writing to radio ${JSON.stringify(this.data())} ${err.toString()}`)
      }
    }
  }

  /**
   * meta data about self
   */
  data() {
    return {
      port_uri: this.port_uri,
      socket_path: this.socket_path,
      baud_rate: this.baud_rate,
      channel: this.channel,
    }
  }

  /**
   * start the radio
   *
   * @param {*} delay start the radio after delay milliseconds
   */
  start(delay = 0) {
    let self = this
    this.timeoutId = setTimeout(() => {
      self.buildInterface()
    }, delay)
  }

  /**
   * cancel the radio
   */
  cancel() {
    clearTimeout(this.timeoutId)
  }

  /**
   * pick the transport from the constructor opts: socket_path -> driver socket,
   * otherwise port_uri -> direct serial.
   */
  makeTransport() {
    if (this.socket_path) {
      return new SocketTransport({ socket_path: this.socket_path })
    }
    return new SerialTransport({ port_uri: this.port_uri, baud_rate: this.baud_rate })
  }

  /**
   * one complete line of radio output -> decode -> emit beep/raw/response/radio-fw
   */
  handleLine(line) {
    let raw_beep
    const now = moment(new Date()).utc()
    try {
      raw_beep = DataReceiver(line)
    } catch (err) {
      // not a JSON document - emit the raw input
      this.emit('raw', line)
      return
    }
    raw_beep.channel = this.channel
    raw_beep.received_at = now
    if (raw_beep.firmware) {
      this.emit('radio-fw', raw_beep.firmware)
      this.fw_version = raw_beep.firmware
      return
    }
    if (raw_beep.key) {
      // radio command response
      this.emit('response', raw_beep)
    } else {
      this.emit('beep', raw_beep)
    }
  }

  /**
   * establish the radio interface over the selected transport and emit the
   * same basic events regardless of transport.
   */
  buildInterface() {
    const transport = this.makeTransport()
    transport.on('open', () => {
      this.emit('open', this.data())
      this.startPollingFirmware()
    })
    transport.on('line', (line) => this.handleLine(line))
    transport.on('error', (err) => {
      this.emit('error', `${err.toString()} ${JSON.stringify(this.data())}`)
    })
    transport.on('close', () => {
      this.stopPollingFirmware()
      this.emit('close', this.data())
      if (this.restart_on_close == true) {
        // restart the radio interface after given delay
        this.start(this.restart_ms)
      }
    })
    this.transport = transport
    transport.open()
  }
}

export { RadioReceiver }

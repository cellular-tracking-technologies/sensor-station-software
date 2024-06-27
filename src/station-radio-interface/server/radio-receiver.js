import { SerialPort, ReadlineParser } from 'serialport'
import moment from 'moment'
import EventEmitter from 'events'

import DataReceiver from '../../hardware/ctt/atmega32u4_receiver.js'

/* event emitter for a radio:   events
  beep  - parsed JSON document from radio
  raw   - radio output not JSON parsable 
  open  - radio port opened
  close - radio closed / radio error
*/
class RadioReceiver extends EventEmitter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    super()
    this.port_uri = opts.port_uri
    this.baud_rate = opts.baud_rate
    this.channel = opts.channel
    this.restart_ms = opts.restart_ms | 15000
    // this.restart_on_close = opts.restart_on_close | true
    this.restart_on_close = opts.restart_on_close
    this.serialport
    this.parser
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
    delete this.port_uri
    delete this.parser
    this.stopPollingFirmware()
    delete this
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
   * @param {*} data - write given data to the radio
   */
  write(data) {
    if (data) { // data was coming in null...
      console.log(`${moment(new Date()).utc().format('YYYY-MM-DD HH:mm:ss')} writing to radio ${this.channel}:  ${data.trim()}`)
      // emit 'write' message  with data to write / channel
      this.emit('write', {
        // msg: data.trim(),
        msg: data,
        channel: this.channel
      })
      this.serialport.write(data.trim() + '\r\n', function (err) {
        if (err) {
          this.emit('error', `error writing to radio ${this.data()} ${err.toString()}`)
        }
      })
    }
  }

  /**
   * meta data about self
   */
  data() {
    return {
      port_uri: this.port_uri,
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
    setTimeout(() => {
      self.buildSerialInterface()
    }, delay)
  }

  /**
 * cancel the radio
 */
  cancel() {
    clearTimeout(this.timeoutId)
  }

  /**
   * establish radio interface connection
   * emit basic events
   */
  buildSerialInterface() {
    let port = new SerialPort({
      path: this.port_uri,
      baudRate: this.baud_rate
    })
    port.on('open', () => {
      this.emit('open', this.data())
    })
    port.on('close', () => {
      this.emit('close', this.data())

      if (this.restart_on_close == true) {
        // restart the radio interface after given delay
        this.start(this.restart_ms)
      }
    })
    port.on('error', (err) => {
      this.emit('error', `${err.toString() + this.data().toString()}`)
    })
    this.serialport = port
    let parser = new ReadlineParser()
    parser.on('data', (line) => {
      let raw_beep
      let now = moment(new Date()).utc()
      try {
        raw_beep = DataReceiver(line)
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
      } catch (err) {
        // not a JSON document - emit the raw input
        this.emit('raw', line)
        return
      }
    })
    this.parser = port.pipe(parser)
    this.startPollingFirmware()
  }
}

export { RadioReceiver }

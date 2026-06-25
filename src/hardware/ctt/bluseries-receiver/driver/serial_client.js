import EventEmitter from 'events'
import net from 'net'
import { SerialPort, ReadlineParser } from 'serialport'

class SerialClient extends EventEmitter {
  constructor(opts) {
    super()

    // Two transports, same interface (emits 'open'/'close'/'line'; write /
    // write_line / dtr / connect). Default = a real serial port. When `socket`
    // is given, talk to a ctt-radio-driver AF_UNIX socket in its LINE framing
    // instead: the driver owns the tty and wraps each receiver line in an NDJSON
    // envelope {"t":"data","line":"<the line>"}; we unwrap `.line` (in place of
    // the ReadlineParser on raw serial) and emit it identically, and we send
    // commands wrapped as {"t":"cmd","op":"raw","arg":"<line>"} so the driver
    // writes them verbatim to the tty. The Blu protocol layer above is unchanged.
    this.socketPath = opts.socket

    if (this.socketPath !== undefined) {
      console.log('connecting to ctt-radio-driver socket', this.socketPath, opts)
      this.stream = new net.Socket()
      this.stream.on('connect', () => {
        console.log(`connected to driver socket ${this.socketPath}`)
        this.emit('open', { socket: this.socketPath })
      })
      this.stream.on('close', () => {
        console.log(`closed driver socket ${this.socketPath}`)
        this.emit('close', { socket: this.socketPath })
      })
      this.stream.on('error', (err) => {
        console.log(`driver socket error on ${this.socketPath} ${err}`)
      })
      // The socket stream is itself NDJSON (one envelope per line); split it the
      // same way, then unwrap the envelope and re-emit the inner receiver line.
      this.parser = this.stream.pipe(new ReadlineParser())
      this.parser.on('data', (envelope) => {
        let msg
        try { msg = JSON.parse(envelope) } catch (e) { return }
        if (msg && msg.t === 'data' && typeof msg.line === 'string') {
          this.emit('line', msg.line)
        }
        // 'hello'/'bye' and any other driver control messages are ignored here.
      })
      return
    }

    const { path } = opts
    if (path === undefined) throw Error('no path provided')
    console.log('opening serial port', path, opts)
    this.port = new SerialPort({
      path,
      baudRate: opts.baud ? opts.baud : 115200,
      autoOpen: false,
    })
    // console.log('baud rate', opts.baud)

    this.port.on('open', () => {
      console.log(`opened serial port ${this.port.path}; baud: ${this.port.baudRate}`)
      this.emit('open', {
        port: this.port.path,
        baud: this.port.baudRate
      })
    })
    this.port.on('close', () => {
      console.log(`closed serial port ${this.port.path}`)
      this.emit('close', { port: this.port.path, })
    })
    this.port.on('error', (err) => {
      console.log(`port error on ${this.port.path} ${err}`)
    })
    // this.port.on('data', (buffer) => {
    //   console.log('rx <-- ', buffer.toString('hex'))
    //   console.log('rx <-- ', buffer.toString())
    //   this.emit('data', buffer)
    // })

    this.parser = this.port.pipe(new ReadlineParser())

    this.parser.on('data', (line) => {
      // console.log("rx-> " + line)
      this.emit('line', line)
    })
  }
  // Wrap a receiver command line as a driver line-mode command (op:raw passes
  // `arg` to the tty verbatim; the driver appends the line terminator).
  _sendCmd(payload) {
    const arg = (typeof payload === 'string') ? payload : payload.toString()
    this.stream.write(JSON.stringify({ t: 'cmd', op: 'raw', arg }) + '\n')
  }
  set dtr(enable) {
    // Over the driver socket there is no DTR line; the driver owns the tty and
    // sets DTR on open. The Blu power_on()/power_off() (dtr toggles) become
    // no-ops here — power/boot is the driver's responsibility.
    if (this.socketPath !== undefined) return
    this.port.set({ dtr: enable })
  }
  connect() {
    if (this.socketPath !== undefined) { this.stream.connect(this.socketPath); return }
    this.port.open()
  }
  write(buffer) {
    if (this.socketPath !== undefined) { this._sendCmd(buffer); return }
    this.port.write(buffer)
  }
  write_line(buffer) {
    // console.log("tx-> " + buffer)
    if (this.socketPath !== undefined) { this._sendCmd(buffer); return }
    this.write(buffer + "\r\n")
  }
  /**
     *
     * @param {*} params.path - USB path to search (undefined if not used)
     * @param {*} params.manufacturer - USB manufacturer to search (undefined if not used)
     *
     */
  static find_port(params) {
    return new Promise((resolve, reject) => {
      SerialPort.list().then((ports) => {
        if (ports.length === 0) {
          // eslint-disable-next-line
          return reject('No Ports Available')
        }
        console.log(params)
        console.log(`identified ${ports.length} usb ports`)
        if (params.manufacturer !== undefined) {
          const results = ports.find((p) => {
            const { manufacturer, vendorId, productId } = p
            if (manufacturer) {
              const bool_check = manufacturer.toUpperCase().trim() === params.manufacturer.toUpperCase().trim()
              return bool_check
            }
            return false
          })
          if (results !== undefined) {
            resolve(results)
          }
        }
        if ((params.path !== undefined)) {
          const results = ports.find((p) => p.path.toUpperCase().trim() === params.path.toUpperCase().trim())
          if (results !== undefined) {
            resolve(results)
          }
        }
        // eslint-disable-next-line
        reject(`Couldn't find port matching ${params.path}, ${params.manufacturer}`)
      })
    })
  }

  static list_ports() {
    SerialPort
      .list()
      .then((ports) => {
        ports.forEach((port) => {
          console.log(`path:${port.path}\tmanufacturer:${port.manufacturer}\tvid:${port.vendorId}\tpid:${port.productId}`)
        })
      })
      .catch((err) => {
        console.log(err)
      })
  }

}

export default SerialClient
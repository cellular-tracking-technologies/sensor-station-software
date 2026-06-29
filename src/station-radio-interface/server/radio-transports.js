import { SerialPort, ReadlineParser } from 'serialport'
import net from 'net'
import EventEmitter from 'events'

/*
  Radio transports — the byte-plumbing under RadioReceiver. Each transport
  abstracts ONE way of reaching a radio receiver and exposes a uniform contract
  so RadioReceiver's decode / event / firmware-poll logic is transport-agnostic.

  Events emitted by every transport:
    open          connection established
    line  <str>   one complete line of receiver output (no trailing CR/LF)
    close         connection ended (peer closed, error, or unplug)
    error <err>   transport-level error

  Methods:
    open()             establish the connection (idempotent per instance)
    writeWire(str)     send one command in the receiver's wire format
                       (e.g. "preset:fsktag", "version", "tx:....")
    close()            tear down the connection
*/

/**
 * Direct serial transport: opens the radio's tty and frames lines with
 * ReadlineParser. This is the legacy path (V2/V3 before the native driver).
 */
class SerialTransport extends EventEmitter {
  constructor({ port_uri, baud_rate }) {
    super()
    this.port_uri = port_uri
    this.baud_rate = baud_rate
    this.port = null
  }

  open() {
    const port = new SerialPort({ path: this.port_uri, baudRate: this.baud_rate })
    port.on('open', () => this.emit('open'))
    port.on('close', () => this.emit('close'))
    port.on('error', (err) => this.emit('error', err))
    const parser = port.pipe(new ReadlineParser())
    parser.on('data', (line) => this.emit('line', line))
    this.port = port
  }

  writeWire(wire) {
    if (!this.port) return
    this.port.write(wire.trim() + '\r\n', (err) => {
      if (err) this.emit('error', err)
    })
  }

  close() {
    try { this.port?.close() } catch (e) { /* already closing */ }
    this.port = null
  }
}

/**
 * Unix-socket transport: connects to a ctt-radio-driver instance serving
 * /run/ctt/radios/ch<N>.sock. The driver speaks NDJSON (one JSON object per
 * line):
 *   driver -> us:  {"t":"hello","device":{...}}      on connect
 *                  {"t":"data","line":"<serial>","seq":N,"ts":...}  per line
 *                  {"t":"bye","reason":...}           on driver shutdown
 *   us -> driver:  {"t":"cmd","op":"raw|tx|preset","arg":"..."}
 * The driver owns the tty; we get a clean line stream and send commands as
 * cmd frames.
 */
class SocketTransport extends EventEmitter {
  constructor({ socket_path }) {
    super()
    this.socket_path = socket_path
    this.sock = null
    this.buf = ''
  }

  open() {
    const sock = net.connect(this.socket_path)
    sock.setEncoding('utf8')
    // Mirror the serial 'open' timing: signal ready once the socket connects,
    // so RadioReceiver issues its preset/config commands and starts polling.
    sock.on('connect', () => this.emit('open'))
    sock.on('data', (chunk) => this._onData(chunk))
    sock.on('error', (err) => this.emit('error', err))
    sock.on('close', () => this.emit('close'))
    this.sock = sock
  }

  _onData(chunk) {
    this.buf += chunk
    let nl
    while ((nl = this.buf.indexOf('\n')) !== -1) {
      const raw = this.buf.slice(0, nl)
      this.buf = this.buf.slice(nl + 1)
      if (!raw) continue
      let msg
      try {
        msg = JSON.parse(raw)
      } catch (e) {
        // Not framed NDJSON — surface as a raw line so nothing is silently lost.
        this.emit('line', raw)
        continue
      }
      switch (msg.t) {
        case 'data':
          if (typeof msg.line === 'string') this.emit('line', msg.line)
          break
        case 'hello':
        case 'bye':
          // hello: device announce (channel is known from the socket name);
          // bye: a 'close' event follows from the driver hanging up.
          break
        default:
          break
      }
    }
    // Guard against an unbounded accumulator if a peer never sends '\n'.
    if (this.buf.length > (1 << 16)) this.buf = ''
  }

  // Translate the receiver wire string into the driver's cmd vocabulary.
  writeWire(wire) {
    if (!this.sock) return
    const s = wire.trim()
    let op, arg
    if (s.startsWith('preset:')) { op = 'preset'; arg = s.slice('preset:'.length) }
    else if (s.startsWith('tx:')) { op = 'tx'; arg = s.slice('tx:'.length) }
    else { op = 'raw'; arg = s }
    this.sock.write(JSON.stringify({ t: 'cmd', op, arg }) + '\n')
  }

  close() {
    try { this.sock?.destroy() } catch (e) { /* already gone */ }
    this.sock = null
  }
}

export { SerialTransport, SocketTransport }

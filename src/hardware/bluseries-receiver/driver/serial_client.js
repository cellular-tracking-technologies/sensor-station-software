import EventEmitter from 'events'
import SerialPort from 'serialport'
import ReadlineParser from '@serialport/parser-readline'

class SerialClient extends EventEmitter {
  constructor(opts) {
    super()

    const { path} = opts
    if (path === undefined) throw Error('no path provided')
    console.log('opening serial port', path, opts)
    this.port = new SerialPort(path, {
      baudRate: opts.baud ? opts.baud : 115200,
      autoOpen: false,
    })
    console.log('baud rate', opts.baud)

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
      console.log(`port error ${err}`)
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
  set dtr(enable) {
    this.port.set({ dtr: enable })
  }
  connect() {
      this.port.open()
  }
  write(buffer) {
    this.port.write(buffer)
  }
  write_line(buffer) {
    // console.log("tx-> " + buffer)
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
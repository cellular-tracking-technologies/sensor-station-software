import SerialClient from './serial_client.js'
import DfuManager from './dfu_manager.js'
import EventEmitter from 'events'

/**
 * @class 
 */
class BluReceiverIo extends EventEmitter {

  #data

  /**
   * Command identifiers used for communicating with the serial receiver.
   */
  #commands = Object.freeze({
    VERSION: 1,
    DFU_START: 2,
    DFU_FRAGMENT: 3,
    DFU_FINISH: 4,
    DFU_CANCEL: 5,
    DETECTIONS: 6,
    LEDS: 7,
    REBOOT: 8,
    STATS: 9,
    CONFIG: 10
  })

  constructor(opts) {
    super()
    /** Initialize private data structure */
    this.#data = {
      detections: [],
      dfu: new DfuManager(),
      usb: new SerialClient({
        path: opts.path,
        baud: 230400,
      }),
      timeout: null
    }

    this.#data.usb.connect()
    this.#data.usb.on('open', async (data) => {
      /** 
       * Power must be applied to the upstream device AFTER a usb connection 
       * has been established.
       */

      // if (this.#data.usb.dtr == false || this.#data.usb.dtr == undefined) {
      //   await this.power_off()
      // }

      await this.power_on()
      /**
       * Wait for the device to boot before sending commands
       */
      setTimeout(() => {
        this.emit('open')
      }, 1500) // initial value was 1500
    })
    this.#data.usb.on('close', async (data) => {

      this.emit('close')
    })
  }

  /**
   * 
   */
  async power_off() {
    this.#data.usb.dtr = true
  }
  async power_on() {
    console.log('Booting Device...')
    this.#data.usb.dtr = false
  }
  reboot(channel) {
    return this.generic_command(channel, this.#commands.REBOOT, 1500)
  }
  stats(channel) {
    return this.generic_command(channel, this.#commands.STATS, 1500)
  }
  version(channel) {
    return this.generic_command(channel, this.#commands.VERSION, 1500)
  }
  /**
   * 
   * @param {*} channel 
   * @param {Number} [opts.scan] Enable/Disable Receiver (Optional)
   * @param {Number} [opts.rx_blink] Enable/Disable Blink on detection (Optional)
   */
  config(channel, opts) {
    const { scan, rx_blink } = opts;
    return this.generic_command(channel, this.#commands.CONFIG, 1500, {
      scan,
      rx_blink
    })
  }
  /**
   * @param {Number} channel Radio Channel
   * @param {Number} opts.data.channel Led Channel {Logo|Beep}
   * @param {Number} opts.data.state Desired Led State {Blink|On|Off}
   * @param {Number} opts.data.blink_rate_ms Rate at which the LED blinks [milliseconds]
   * @param {Number} opts.data.blink_count Number of LED blinks before an automatic Off Transition {-1 to blink forever}
   * @returns {Promise}
   */
  led(channel, opts) {
    return this.generic_command(channel, this.#commands.LEDS, 3000, {
      channel: opts.channel,
      state: opts.state,
      blink_rate_ms: opts.blink_rate_ms,
      blink_count: opts.blink_count
    })
  }
  /**
   * 
   * @param {*} channel 
   * @param {*} file
   * @returns {Promise} 
   */
  dfu(channel, file) {

    let promise = new Promise((resolve, reject) => {

      this.addSelfDestructingEventListener('line', { timeout: 1500, reload: true }, (data, error) => {
        if (error === 'timeout') {
          reject(error)
          return true
        }

        try {
          let o = JSON.parse(data)
          // console.log('dfu o', o)
          switch (o.type) {
            case this.#commands.DFU_START:
              this.send_command(this.#data.dfu.fragment(this.#commands.DFU_FRAGMENT))
              break
            case this.#commands.DFU_FRAGMENT:
              if (this.#data.dfu.end_of_fragments()) {
                this.send_command(this.#data.dfu.finish(this.#commands.DFU_FINISH))
              } else {
                this.send_command(this.#data.dfu.fragment(this.#commands.DFU_FRAGMENT))
              }
              break
            case this.#commands.DFU_FINISH:
            case this.#commands.DFU_CANCEL:
              resolve({})
              return true
          }

        } catch (e) {
          reject(e)
          return true
        }

        return false
      })
    });

    this.send_command(this.#data.dfu.start(this.#commands.DFU_START, {
      channel,
      file,
    }))

    return promise
  }
  /**
   * 
   * @param {*} channel
   * @returns {Promise} 
   */
  poll_detections(channel) {
    let promise = new Promise((resolve, reject) => {
      let detections = []

      this.addSelfDestructingEventListener('line', { timeout: 1500, reload: true }, (data, error) => {
        // console.log('self destruct event listener', data)
        if (error === 'timeout') {
          reject(error)
          return true
        }

        try {
          let o = JSON.parse(data)
          if (o.type !== this.#commands.DETECTIONS) { return false }

          /** Device has no more detections when it responds with an empty data object */
          if (Object.keys(o.data).length === 0) {
            resolve({ error, data: detections })
            return true
          } else {

            /** parse tag id, payload, and rssi here */
            let payload = Buffer.from(o.data.detection, 'base64')

            let detection = {
              channel: o.channel,
              time: new Date(Date.now() - (o.data.current_tick_ms - o.data.detect_tick_ms)),
              rssi: o.data.rssi,
              id: payload.toString("hex", 0, 4),
              sync: payload.readUInt16LE(4),
              product: payload.readUInt8(6),
              revision: payload.readUInt8(7),
              payload: {
                parsed: {},
                raw: ""
              }
            }

            if (payload.length > 8) {
              console.log('payload', payload, 'payload length', payload.length)

              detection.payload.raw = payload.toString("hex", 8)

              switch (detection.revision) {
                case 0:
                  detection.payload.parsed = {
                    solar: payload ? payload.readUInt16LE(8) / 1000 : 0,
                    temp: payload.readUInt16LE(10) / 100
                  }
                  break
                default:
                  break
              }
            }

            detections.push(detection)

            return false
          }

        } catch (e) {
          reject({ error: e, data: detections })
          return true
        }
      })
    });

    this.send_command({
      type: this.#commands.DETECTIONS,
      channel: channel,
      data: {}
    })

    return promise
  }
  generic_command(channel, type, timeout, data = {}) {
    let promise = new Promise((resolve, reject) => {

      this.addSelfDestructingEventListener('line', { timeout, reload: false }, (data, error) => {
        if (error === 'timeout') {
          reject(error)
          return true
        }
        try {
          let o = JSON.parse(data)
          if (o.type === type) {
            resolve(o.data)
            return true
          }
        } catch (e) {
          reject(e)
          return true
        }
        return false
      })
    })

    this.send_command({
      type: type,
      channel: channel,
      data,
    })

    return promise
  }
  clearlistener(eventType) {
    console.log('clear listener data', this.#data)
    this.#data.usb.removeAllListeners(eventType)
  }
  /**
   * 
   * @param {*} eventType 
   * @param {*} timing.timeout
   * @param {*} timing.reload 
   * @param {*} callback Should return TRUE to destruct the event listener, otherwise FALSE
   */
  addSelfDestructingEventListener(eventType, timing, on_event) {
    let timeout

    this.handler = (result) => {
      if (on_event(result) === true) {
        clearTimeout(timeout)
        /** remove event listener */
        this.#data.usb.off(eventType, this.handler);
        return
      } else {
        if (timing.reload) {
          clearTimeout(timeout)
          timeout = setTimeout(() => {
            on_event(null, 'timeout')
            /** remove event listener */
            this.#data.usb.off(eventType, this.handler);
          }, timing.timeout)
        }
      }
    };
    this.#data.usb.on(eventType, this.handler);

    timeout = setTimeout(() => {
      on_event(null, 'timeout')
      /** remove event listener */
      this.#data.usb.off(eventType, this.handler);
    }, timing.timeout)
  };

  send_command(command) {
    this.#data.usb.write_line(JSON.stringify(command))
  }
}

export default BluReceiverIo
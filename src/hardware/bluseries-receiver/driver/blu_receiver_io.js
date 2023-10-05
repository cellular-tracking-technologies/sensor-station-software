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
    this.#data.usb.on('open', (data) => {
      /** 
       * Power must be applied to the upstream device AFTER a usb connection 
       * has been established.
       */
      this.power_on()
      /**
       * Wait for the device to boot before sending commands
       */
      setTimeout(() => {
        this.emit('open')
      }, 1000)
    })
    this.#data.usb.on('close', (data) => {
      this.emit('close')
    })
  }

  /**
   * 
   */
  power_off() {
    this.#data.usb.dtr = true
  }
  power_on() {
    console.log('Booting Device...')
    this.#data.usb.dtr = false
  }
  reboot(channel) {
    return this.generic_command(channel, this.#commands.REBOOT, 500)
  }
  stats(channel) {
    return this.generic_command(channel, this.#commands.STATS, 500)
  }
  version(channel) {
    return this.generic_command(channel, this.#commands.VERSION, 500)
  }
  /**
   * 
   * @param {*} channel 
   * @param {Number} [opts.scan] Enable/Disable Receiver (Optional)
   * @param {Number} [opts.rx_blink] Enable/Disable Blink on detection (Optional)
   */
  config(channel, opts) {
    const { scan, rx_blink } = opts;
    return this.generic_command(channel, this.#commands.CONFIG, 500, {
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
    return this.generic_command(channel, this.#commands.LEDS, 500, {
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

      this.addSelfDestructingEventListener('line', { timeout: 500, reload: true }, (data, error) => {
        if (error === 'timeout') {
          reject(error)
          return true
        }

        try {
          let o = JSON.parse(data)
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

      this.addSelfDestructingEventListener('line', { timeout: 500, reload: true }, (data, error) => {
        if (error === 'timeout') {
          reject(error)
          return true
        }

        try {
          let o = JSON.parse(data)
          if (o.type !== this.#commands.DETECTIONS) { return false }

          /** Device has no more detections when it responds with an empty data object */
          if (Object.keys(o.data).length === 0) {
            resolve({ error: e, data: detections })
            return true
          } else {

            /** parse tag id, payload, and rssi here */
            let payload_hex = Buffer.from(o.data.detection, 'base64').toString("hex")
            detections.push({
              channel: o.channel,
              time: new Date(Date.now() - (o.data.current_tick_ms - o.data.detect_tick_ms)),
              rssi: o.data.rssi,
              id: payload_hex.substring(8, 16),
              sync: payload_hex.substring(16, 20),
              product: payload_hex.substring(20, 21),
              revision: payload_hex.substring(21, 22),
              payload: payload_hex.substring(22, payload_hex.length - 6)
            })
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
        this.#data.usb.off(eventType, this.handler);
        return
      } else {
        if (timing.reload) {
          clearTimeout(timeout)
          timeout = setTimeout(() => {
            on_event(null, 'timeout')
            this.#data.usb.off(eventType, this.handler);
          }, timing.timeout)
        }
      }
    };
    this.#data.usb.on(eventType, this.handler);

    timeout = setTimeout(() => {
      on_event(null, 'timeout')
      this.#data.usb.off(eventType, this.handler);
    }, timing.timeout)
  };

  send_command(command) {
    this.#data.usb.write_line(JSON.stringify(command))
  }
}

export default BluReceiverIo
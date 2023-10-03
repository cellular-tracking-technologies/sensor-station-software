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
    REBOOT: 8
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
    this.send_command({
      type: this.#commands.REBOOT,
      channel: channel,
      data: {}
    })

    return new Promise((resolve, reject) => {
      this.addSelfDestructingEventListener('line', (data) => {
        this.clear_send_timeout()
        try {
          let o = JSON.parse(data)
          if (o.type === this.#commands.REBOOT) {
            resolve({
              channel: o.channel
            })
            return true
          }
        } catch (e) {
          reject(e)
          return true
        }
        return false
      })
    });
  }
  /**
   * @typedef {Object} VersionResolveData
   * @param {Number} res.channel - 
   * @param {String} res.app - 
   * @param {String} res.version - 
   */
  /**
   * @typedef VersionRejectData
   * @param {Error} error - The error that occurred while loading the result.
   */
  /**
   * @promise VersionPromise
   * @fulfill {VersionResolveData} 
   * @reject {VersionRejectData}
   */
  /**
   * Request the receiver version
   * @param {Number} channel Range: {1:4}
   * @returns {Promise<VersionPromise>} resolve: {@link VersionResolveData} reject: {@link VersionRejectData}
   */
  version(channel) {
    return new Promise((resolve, reject) => {

      this.send_command({
        type: this.#commands.VERSION,
        channel: channel,
        data: {}
      })

      let timeout = setTimeout(() => {
        reject('timeout')
      }, 250)

      this.addSelfDestructingEventListener('line', (data) => {
        clearTimeout(timeout);
        try {
          let o = JSON.parse(data)
          if (o.type === this.#commands.VERSION) {
            resolve({
              channel: o.channel,
              app: o.data.app,
              version: o.data.version
            })
            return true
          }
        } catch (e) {
          reject(e)
          return true
        }
        return false
      })
    });
  }
  /**
   * 
   * @param {Number} channel Radio Channel
   * @param {Number} opts.data.channel Led Channel {Logo|Beep}
   * @param {Number} opts.data.state Desired Led State {Blink|On|Off}
   * @param {Number} opts.data.blink_rate_ms Rate at which the LED blinks [milliseconds]
   * @param {Number} opts.data.blink_count Number of LED blinks before an automatic Off Transition {-1 to blink forever}
   * @returns {Promise}
   * @example // Blink the logo led of receiver channel 1 every 100ms, forever.
   * driver.led(1, {
   *    channel: leds.type.logo,
   *    state: leds.state.blink,
   *    blink_rate_ms: 100,
   *    blink_count: leds.utils.forever
   * }).then((res) => {
   *    console.log(res)
   * }).catch((err) =>{
   *    console.log(err)
   * })
   */
  led(channel, opts) {
    this.send_command({
      type: this.#commands.LEDS,
      channel: channel,
      data: {
        channel: opts.channel,
        state: opts.state,
        blink_rate_ms: opts.blink_rate_ms,
        blink_count: opts.blink_count
      }
    })

    return new Promise((resolve, reject) => {

      let timeout = setTimeout(() => {
        reject('timeout')
      }, 250)

      this.addSelfDestructingEventListener('line', (data) => {
        clearTimeout(timeout);
        try {
          let o = JSON.parse(data)
          if (o.type !== this.#commands.LEDS) { return false }

          resolve({
            channel: o.channel,
            error: o.data.error,
          })

          return true
        } catch (e) {
          reject(e)
          return true
        }
      })
    });
  }

  /**
   * 
   * @param {*} channel 
   * @param {*} file
   * @returns {Promise} 
   */
  dfu(channel, file) {
    this.send_command(this.#data.dfu.start(this.#commands.DFU_START, {
      channel,
      file,
    }))

    return new Promise((resolve, reject) => {

      let timeout = setTimeout(() => {
        reject('timeout')
      }, 250)

      this.addSelfDestructingEventListener('line', (data) => {
        clearTimeout(timeout);

        try {
          let o = JSON.parse(data)
          switch (o.type) {
            case this.#commands.DFU_START:
              this.send_command(this.#data.dfu.fragment(this.#commands.DFU_FRAGMENT))
              timeout = setTimeout(() => {
                reject('timeout')
              }, 250)

              break
            case this.#commands.DFU_FRAGMENT:
              if (this.#data.dfu.end_of_fragments()) {
                this.send_command(this.#data.dfu.finish(this.#commands.DFU_FINISH))
              } else {
                this.send_command(this.#data.dfu.fragment(this.#commands.DFU_FRAGMENT))
              }
              timeout = setTimeout(() => {
                reject('timeout')
              }, 250)

              break
            case this.#commands.DFU_FINISH:
            case this.#commands.DFU_CANCEL:
              resolve({
                channel: o.channel,
                error: 'none',
              })
              return true
          }

        } catch (e) {
          reject(e)
          return true
        }

        return false
      })
    });
  }
  /**
   * 
   * @param {*} channel
   * @returns {Promise} 
   */
  poll_detections(channel) {
    this.send_command({
      type: this.#commands.DETECTIONS,
      channel: channel,
      data: {}
    })

    return new Promise((resolve, reject) => {
      let detections = []

      let timeout = setTimeout(() => {
        reject('timeout')
      }, 1000)

      this.addSelfDestructingEventListener('line', (data) => {

        try {
          let o = JSON.parse(data)
          if (o.type !== this.#commands.DETECTIONS) { return false }

          /** Device has no more detections when it responds with an empty data object */
          if (Object.keys(o.data).length === 0) {
            clearTimeout(timeout)
            resolve(detections)
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
          clearTimeout(timeout)
          reject(e)
          return true
        }
      })
    });
  }
  update_config_value(channel, opts) {

  }
  /**
   * 
   * @param {*} eventType 
   * @param {*} callback Should return TRUE to destruct the event listener, otherwise FALSE
   */
  addSelfDestructingEventListener(eventType, callback) {
    this.handler = (result) => {
      if (callback(result) === true) {
        this.#data.usb.off(eventType, this.handler);
      }
    };
    this.#data.usb.on(eventType, this.handler);
  };

  send_command(command) {
    this.#data.usb.write_line(JSON.stringify(command))
  }
}

export default BluReceiverIo
import EventEmitter from 'events'
import BluReceiverIo from "./driver/blu_receiver_io.js";

class BluReceiverTask {
  static get VERSION() { return 1 }
  static get DETECTIONS() { return 2 }
  static get LEDS() { return 3 }
  static get DFU() { return 4 }
  static get REBOOT() { return 5 }
  static get CONFIG() { return 6 }
  static get STATS() { return 7 }
}

class BluReceiver extends EventEmitter {
  #data
  constructor(opts) {
    super()
    this.#data = {
      io: new BluReceiverIo({ path: opts.path }),
      queue: [],
      processing: false,
      connected: false
    }

    this.#data.io.on('open', () => {
      this.#data.connected = true
      this.run_schedule()
    })
    this.#data.io.on('close', () => {

      this.#data.connected = false
      // process.exit(0) // shuts down program if usb adapter is removed
    })
  }
  /**
   * 
   * @param {Number} opts.task For options, see BluReceiverTask
   * @param {Number} opts.radio_channel
   * @param {Number} opts.data
   */
  async schedule(opts) {
    this.#data.queue.push(opts)
    if (this.#data.processing === false) {
      this.#data.processing = true
      await this.run_schedule()
    }
  }
  async run_schedule() {
    if (this.#data.connected === false) {
      return
    }
    if (this.#data.queue.length === 0) {
      this.#data.processing = false
      return
    }

    const job = this.#data.queue.shift()

    switch (job.task) {
      case BluReceiverTask.VERSION:

        try {
          const { app, version } = await this.#data.io.version(job.radio_channel)

          this.finalize({
            task: BluReceiverTask.VERSION,
            radio_channel: job.radio_channel,
            error: null,
            data: {
              app,
              version
            }
          })
        } catch (e) {
          console.log('get version error', e)
          this.finalize({
            task: BluReceiverTask.VERSION,
            radio_channel: job.radio_channel,
            error: e,
            data: null
          })
        } finally {
          this.run_schedule()
        }

        break
      case BluReceiverTask.DETECTIONS:

        try {

          const { data } = await this.#data.io.poll_detections(job.radio_channel)
          this.finalize({
            task: BluReceiverTask.DETECTIONS,
            radio_channel: job.radio_channel,
            error: null,
            data,
          })

        } catch (e) {

          const { error, data } = e
          this.finalize({
            task: BluReceiverTask.DETECTIONS,
            radio_channel: job.radio_channel,
            error,
            data,
          })

        } finally {
          this.run_schedule()
        }

        break
      case BluReceiverTask.DFU:

        try {
          const data = await this.#data.io.dfu(job.radio_channel, job.data.file)
          this.finalize({
            task: BluReceiverTask.DFU,
            radio_channel: job.radio_channel,
            error: null,
            data,
          })

        } catch (e) {

          this.finalize({
            task: BluReceiverTask.DFU,
            radio_channel: job.radio_channel,
            error: e,
            data: {}
          })

        } finally {
          this.run_schedule()
        }

        break
      case BluReceiverTask.LEDS:

        try {

          const { led_channel, state, blink_rate_ms, blink_count } = job.data
          await this.#data.io.led(job.radio_channel, {
            channel: led_channel,
            state,
            blink_rate_ms,
            blink_count
          })

          this.finalize({
            task: BluReceiverTask.LEDS,
            radio_channel: job.radio_channel,
            error: null,
            data: {},
          })

        } catch (e) {

          this.finalize({
            task: BluReceiverTask.LEDS,
            radio_channel: job.radio_channel,
            error: e,
            data: {},
          })

        } finally {
          this.run_schedule()
        }

        break
      case BluReceiverTask.REBOOT:

        try {
          const data = await this.#data.io.reboot(job.radio_channel)

          this.finalize({
            task: BluReceiverTask.REBOOT,
            radio_channel: job.radio_channel,
            error: null,
            data,
          })

        } catch (e) {

          this.finalize({
            task: BluReceiverTask.REBOOT,
            radio_channel: job.radio_channel,
            error: e,
            data: null
          })

        } finally {
          this.run_schedule()
        }

        break
      case BluReceiverTask.CONFIG:

        try {

          const data = await this.#data.io.config(job.radio_channel, job.data)

          this.finalize({
            task: BluReceiverTask.CONFIG,
            radio_channel: job.radio_channel,
            error: null,
            data,
          })

        } catch (e) {

          this.finalize({
            task: BluReceiverTask.CONFIG,
            radio_channel: job.radio_channel,
            error: e,
            data: null
          })

        } finally {
          this.run_schedule()
        }

        break;
      case BluReceiverTask.STATS:

        try {
          const data = await this.#data.io.stats(job.radio_channel)

          this.finalize({
            task: BluReceiverTask.STATS,
            radio_channel: job.radio_channel,
            error: null,
            data,
          })

        } catch (e) {

          this.finalize({
            task: BluReceiverTask.STATS,
            radio_channel: job.radio_channel,
            error: e,
            data: null
          })

        } finally {
          this.run_schedule()
        }

        break;
      default:
        break
    }
  }
  /**
   * 
   * @param {Enum} opts.task 
   * @param {Number} opts.channel
   * @param {*} opts.error
   * @param {Object} opts.data
   */
  finalize(opts) {
    const { task, radio_channel, error, data } = opts
    this.emit('complete', {
      task,
      radio_channel,
      error,
      data,
    })
  }
}

export { BluReceiver, BluReceiverTask }
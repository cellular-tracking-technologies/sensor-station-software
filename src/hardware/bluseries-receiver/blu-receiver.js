import EventEmitter from 'events'
import BluReceiverIo from "./driver/blu_receiver_io.js";

class BluReceiverTask {
  static get VERSION() { return 1 }
  static get DETECTIONS() { return 2 }
  static get LEDS() { return 3 }
  static get DFU() { return 4 }
  static get REBOOT() { return 5 }
}

class BluReceiver extends EventEmitter {
  #data
  constructor(opts) {
    super()
    console.log('creating bui receiver object', opts)
    this.#data = {
      io: new BluReceiverIo({ path: opts.path }),
      queue: [],
      processing: false
    }
  }
  /**
   * 
   * @param {Number} opts.task For options, see BluReceiverTask
   * @param {Number} opts.channel
   * @param {Number} opts.data
   */
  schedule(opts) {
    this.#data.queue.push(opts)
    if (this.#data.processing === false) {
      this.#data.processing = true
      this.run_schedule()
    }
  }
  run_schedule() {
    if (this.#data.queue.length === 0) {
      this.#data.processing = false
      return
    }

    const job = this.#data.queue.shift()

    switch (job.task) {
      case BluReceiverTask.VERSION:
        this.#data.io.version(job.channel).then((res) => {    

          this.finalize({
            task: BluReceiverTask.VERSION,
            channel: job.channel,
            error: null,
            data: {
              app: res.app,
              version: res.version
            }
          })

        }).catch((err) => {

          this.finalize({
            task: BluReceiverTask.VERSION,
            channel: job.channel,
            error: err,
            data: null
          })

        }).finally(() => {
          this.run_schedule()
        })

        break
      case BluReceiverTask.DETECTIONS:
        this.#data.io.poll_detections(job.channel).then((res) => {

          this.finalize({
            task: BluReceiverTask.DETECTIONS,
            channel: job.channel,
            error: null,
            data: res
          })

        }).catch((err) => {
          console.log(err)
        }).finally(() => { this.run_schedule() })
        break
      case BluReceiverTask.DFU:
        this.#data.io.dfu(job.channel, job.data.file).then((res) => {
          console.log(res)
        }).catch((err) => {
          console.log(err)
        }).finally(() => { this.run_schedule() })
        break
      case BluReceiverTask.LEDS:
        this.#data.io.led(job.channel, {
          channel: job.data.channel,
          state: job.data.state,
          blink_rate_ms: job.data.blink_rate_ms,
          blink_count: job.data.blink_count
        }).then((res) => {
          console.log(res)
        }).catch((err) => {
          console.log(err)
        }).finally(() => { this.run_schedule() })
        break
      case BluReceiverTask.REBOOT:
        break
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
    const { task, channel, error, data } = opts
    this.emit('complete', {
      task,
      channel,
      error,
      data,
    })
  }
}

export { BluReceiver, BluReceiverTask }
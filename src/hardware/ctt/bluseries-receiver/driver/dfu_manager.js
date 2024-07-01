import EventEmitter from 'events'
import os from "os"

const DFU_CHUNK_SIZE = 128

/**
 * @class DfuManager
 * @classdesc
 * @example
 * let dfu = new DfuManager()
 */
class DfuManager extends EventEmitter {
  #data

  /**
   * @constructs DfuManager
   * @description Initializes a DFU job by specifying a file, device, and serialization size         
   */
  constructor() {
    super()

    this.#data = {
      channel: -1,
      file: null,
      chunk_size: DFU_CHUNK_SIZE,
      position: 0,
      fragment: 0,
      start: 0
    }
  }
  
  /**
   * @param {Buffer} opts.file
   * @param {Number} opts.channel
   * @returns {String}
   */
  start(command, opts) {
    this.#data.channel = opts.channel
    this.#data.file = opts.file
    this.#data.start = os.uptime()
    this.#data.position = 0
    this.#data.fragment = 0

    return {
      type: command,
      channel: this.#data.channel,
      data: {
        size: opts.file.length,
        header: opts.file.subarray(0, 32).toString('base64')
      }
    }
  }
  fragment(command) {
    const ret = {
      type: command,
      channel: this.#data.channel,
      data: {
        fragment: this.#data.fragment,
        encoding: 'base64',
        body: this.#data.file.subarray(this.#data.position, this.#data.position + this.#data.chunk_size).toString('base64')
      }
    }

    this.#data.fragment += 1
    this.#data.position += this.#data.chunk_size

    return ret
  }
  finish(command) {
    return {
      type: command,
      channel: this.#data.channel,
      data: { /** empty body required */ }
    }
  }
  cancel(command) {
    return {
      type: command,
      channel: this.#data.channel,
      data: { /** empty body */ }
    }
  }
  progress() {
    return {
      progress: (this.#data.position / this.#data.file.length) * 100,
      duration: os.uptime() - this.#data.duration
    }
  }
  end_of_fragments() {
    return this.#data.position >= this.#data.file.length
  }
}

export default DfuManager
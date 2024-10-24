import fs from 'fs'
import _ from 'lodash'

/**
 * generic logger class is intended receive data records, buffer to cache
 * and write to disk 
 */
class Logger {
  /**
   * @constructor
   * @param {string} opts.uri- suffix for station
   * @param {object} opts.formatter- data formatter with file header 
   *    formatter expected to have header field and a formatRecord method for translating records to file format
   */
  constructor(opts) {
    this.fileuri = opts.fileuri
    this.formatter = opts.formatter
    this.suffix = opts.suffix

    // check if a line termintaor is passed, otherwise default to windows \r\n
    this.line_terminator = '\r\n'
    if (opts.line_terminator) {
      this.line_terminator = opts.line_terminator
    }

    this.record_cache = []
  }

  /**
   * 
   * @param {record} record to add to cache, to be parsed by provided formatter
   */
  addRecord(record) {
    let data
    let line = this.formatter.formatRecord(record)
    if (line) {
      this.record_cache.push(line)
      data = _.zipObject(this.formatter.header, line)
    } else {
      data = {}
    }
    return data
  }

  /**
   * write cache to disk
   */
  writeCacheToDisk() {
    return new Promise((resolve, reject) => {
      let record, lines = []
      while (this.record_cache.length > 0) {
        record = this.record_cache.shift()
        lines.push(record.join(','))
      }
      // if there are no lines to write - move on
      if (lines.length > 0) {
        // if the file doesn't exist - write a header line
        if (!fs.existsSync(this.fileuri)) {
          lines.unshift(this.formatter.header.join(','))
        }
        fs.appendFile(this.fileuri, lines.join(this.line_terminator) + this.line_terminator, (err) => {
          if (err) {
            reject(err)
          }
          // finished writing
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

export { Logger }
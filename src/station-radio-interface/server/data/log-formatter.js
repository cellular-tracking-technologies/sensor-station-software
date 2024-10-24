/**
 * file formatter for GPS files
 */
class LogFormatter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'msg at',
      'msg'
    ]
    this.date_format = opts.date_format
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    return [
      record
    ]
  }
}

export { LogFormatter }
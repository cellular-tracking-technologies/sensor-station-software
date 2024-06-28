import moment from 'moment'
import MessageTypes from '../../../hardware/ctt/messages.js'

/**
 * file formatter for BLE data
 */
class BluFormatter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'UsbPort',
      'RadioId',
      'Time',
      'TagRSSI',
      'TagId',
      'Sync',
      'Product',
      'Revision',
      'NodeId',
      'Payload',
    ]
    this.date_format = opts.date_format
  }

  /**
   * 
   * @param {object} record - Blu tag record
   * @param {Integer} record.port
   * @param {Integer} record.channel
   * @param {Date} record.time
   * @param {Integer} record.rssi
   * @param {String} record.id
   * @param {Integer} record.sync
   * @param {Integer} record.product
   * @param {Integer} record.revision
   * @param {Object} record.payload
   */
  formatRecord(record) {
    const { meta, port, channel } = record

    switch (meta?.data_type) {
      case MessageTypes.BluTag:
        return [
          port,
          channel,
          moment(new Date(record.time)).utc().format(this.date_format),
          record.rssi,
          record.id,
          record.sync,
          record.product,
          record.revision,
          '',
          record.payload.raw.toString(),
        ]
      case MessageTypes.NodeBluData:
        const { rssi, id, sync } = record.data
        return [
          channel,
          '',
          moment(new Date(record.data.rec_at * 1000)).utc().format(this.date_format),
          rssi,
          id,
          sync,
          '',
          '',
          meta.source.id,
          '',
        ]
      default:
        console.log('unexpected tag to format in blu formatter', meta)
        console.log(record)
    }
  }
}

export { BluFormatter }
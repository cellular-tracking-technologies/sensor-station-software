import moment from 'moment'

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
      'RadioId',
      // 'BluRadioId',
      'Time',
      'TagRSSI',
      'TagId',
      'Sync',
      'Product',
      'Revision',
      'Payload',
      'NodeId',
    ]
    this.date_format = opts.date_format
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {

    let fields, channel, recorded_at, tag_rssi, id, sync, product, revision, payload
    let node_id = ''

    channel = record.channel
    recorded_at = moment(new Date(record.time)).utc()
    tag_rssi = record.rssi
    id = record.id
    sync = record.sync
    product = record.product
    revision = record.revision
    payload = record.payload

    fields = [

      channel,
      recorded_at.format(this.date_format),
      tag_rssi,
      id,
      sync,
      product,
      revision,
      payload,
      node_id,
    ]

    return fields
  }
}

export { BluFormatter }
import moment from 'moment'
// import bluParser from './blu-parser.js'
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
      // 'Service',
      // 'Family',
      // 'Id',
      'VCC',
      'Temp',
      'Raw Payload',
      'NodeId',
      // 'Broadcast Id',
      // 'Payload Id',
    ]
    this.date_format = opts.date_format
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    console.log('blu formatter record', record)
    let fields, channel, recorded_at, product, tag_rssi, id, sync, revision, raw_payload, solar, temp
    // let { service, family, vcc, temp, broadcast_id, id: payload_id } = bluParser(Buffer.from(record.payload.raw, 'hex'))

    let node_id = ''

    channel = record.channel
    recorded_at = moment(new Date(record.time)).utc()
    tag_rssi = record.rssi
    id = record.id
    sync = record.sync
    product = record.product
    revision = record.revision
    solar = record.payload.parsed.solar
    temp = record.payload.parsed.temp
    raw_payload = record.payload.raw.toString()


    fields = [

      channel,
      recorded_at.format(this.date_format),
      tag_rssi,
      id,
      sync,
      product,
      revision,
      // service,
      // family,
      solar,
      temp,
      raw_payload,
      node_id,
      // broadcast_id,
      // payload_id
    ]

    return fields
  }
}

export { BluFormatter }
import moment from 'moment'
/**
 * file formatter for GPS files
 */
class BeepFormatter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'Time',
      'RadioId',
      'TagId',
      'TagRSSI',
      'NodeId',
      'Validated'
    ]
    this.date_format = opts.date_format
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    let fields, recorded_at, tag_rssi
    let node_id = ''
    let validated = 0
    let tag_id = record.data.id
    if (record.protocol) {
      // handle new protocol
      switch (record.meta.data_type) {
        case 'node_coded_id':
          // beep originated from a node
          // get the node id, and get the recorded at date from the device
          node_id = record.meta.source.id
          recorded_at = moment(new Date(record.data.rec_at * 1000)).utc()
          tag_rssi = record.data.rssi
          break
        case 'coded_id':
          tag_rssi = record.meta.rssi
          recorded_at = record.received_at
          break
        default:
          // beep on the radio - use the time it was received
          recorded_at = record.received_at
          break
      }
      if (tag_id.length == 10) {
        // tag includes a CRC - validated by device
        tag_id = tag_id.slice(0, tag_id.length - 2)
        validated = 1
      }

      fields = [
        recorded_at.format(this.date_format),
        record.channel,
        tag_id,
        tag_rssi,
        node_id,
        validated
      ]
    } else {
      // handle original protocol
      if (record.data.tag) {
        // beep received at radio
        recorded_at = record.received_at
        fields = [
          recorded_at.format(this.date_format),
          record.channel,
          record.data.tag.id,
          record.rssi,
          '',
          validated
        ]
      } else if (record.data.node_beep) {
        // beep received by a node
        recorded_at = record.received_at.subtract(record.data.node_beep.offset_ms, 'ms')
        fields = [
          record.received_at.format(this.date_format),
          record.channel,
          record.data.node_tag.tag_id,
          record.data.node_beep.tag_rssi,
          record.data.node_beep.id,
          validated
        ]
      } else {
        console.error(`i don't know what to do ${record}`)
        fields = null
      }
    }
    return fields
  }
}

export { BeepFormatter }
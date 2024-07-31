import moment from 'moment'
import MessageTypes from '../../../hardware/ctt/messages.js'

/**
 * file formatter for GPS files
 */
class NodeHealthFormatter {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'Time',
      'RadioId',
      'NodeId',
      'NodeRSSI',
      'Battery',
      'Celsius',
      'RecordedAt',
      'Firmware',
      'SolarVolts',
      'SolarCurrent',
      'CumulativeSolarCurrent',
      'Latitude',
      'Longitude',
      'UpTime',
      'AverageChargerCurrentMa',
      'EnergyUsed',
      'SdFree',
      'Detections',
      'Errors'
    ]
    this.date_format = opts.date_format
  }

  /**
   * 
   * @param {object} record - GPS record received from GPSD
   */
  formatRecord(record) {
    let node_id
    // check for new protocol 
    if (record.protocol) {
      // new protocol detected - check if a node origin
      const { meta } = record
      if (meta.source) {
        node_id = meta.source.id
      }
      if (node_id == null) {
        console.error('no node id in record', record)
        return
      }
      const recorded_at = moment(new Date(record.data.sent_at * 1000)).utc()
      switch (meta.data_type) {
        case MessageTypes.NodeHealth:
          return [
            record.received_at.format(this.date_format),
            record.channel,
            node_id,
            record.meta.rssi,
            record.data.bat_v / 100,
            record.data.temp_c,
            recorded_at.format(this.date_format),
            record.data.fw,
            record.data.sol_v / 100,
            record.data.sol_ma,
            record.data.sum_sol_ma,
            record.data.lat ? record.data.lat / 1000000 : '',
            record.data.lon ? record.data.lon / 1000000 : ''
          ]
        case MessageTypes.NodeBluHealth:
          const {
            up_time,
            charge_ma_avg,
            temp_batt,
            energy_used,
            sd_free,
            detections,
            errors,
          } = record.data
          return [
            record.received_at.format(this.date_format),
            record.channel,
            node_id,
            record.meta.rssi,
            record.data.batt_mv / 1000,
            temp_batt,
            recorded_at.format(this.date_format),
            null,
            null,
            null,
            null,
            record.data.lat ? record.data.lat / 1000000 : '',
            record.data.lon ? record.data.lon / 1000000 : '',
            up_time,
            charge_ma_avg,
            energy_used,
            sd_free,
            detections,
            errors,
          ]
      }
    } else {
      // old protocol detected
      if (record.data.node_alive == null) {
        console.error('invalid node health message', record)
        return
      }
      let fields = [
        record.received_at.format(this.date_format),
        record.channel,
        record.data.node_alive.id,
        record.rssi,
        record.data.node_alive.battery_mv / 1000,
        record.data.node_alive.celsius,
        '',
        record.data.node_alive.firmware,
        '',
        '',
        '',
        '',
        ''
      ]
      return fields
    }
  }
}

export { NodeHealthFormatter }
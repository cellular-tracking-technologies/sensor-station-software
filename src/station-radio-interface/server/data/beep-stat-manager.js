/**
 * class for managing tag stats
 */
class BeepStatManager {
  /**
   * initialize stats document
   */
  constructor() {
    this.stats = {
      channels: {},
    }
    this.blu_stats = {
      blu_ports: {},
    }
  }

  /**
   * 
   */
  addBluStatChannel(port, channel) {
    let blu_channel_data = {
      beeps: {},
      blu_dropped: 0,
      // msg_type: 'blu_stats',
    }
    this.blu_stats.blu_ports[port].channels[channel] = blu_channel_data
    // console.log('add blu stat channel blu data', blu_channel_data, 'blu stats', this.blu_stats.blu_ports[port].channels[channel].blu_beeps)
    return blu_channel_data
  }

  /**
   * 
   * @param {*} channel 
   * 
   *  add empty stat document for a given channel
   */
  addStatChannel(channel) {
    let channel_data = {
      beeps: {},
      nodes: {
        beeps: {},
        health: {}
      },
      telemetry: {},
    }
    this.stats.channels[channel] = channel_data
    return channel_data
  }

  /**
   * 
   * @param {*} record - beep data
   *  
   *  get in memory stat document for a given record by channel id - create the entry if does not exist
   */
  getChannel(record) {

    if (Object.keys(this.stats.channels).includes(record.RadioId.toString())) {
      return this.stats.channels[record.RadioId]
    } else {
      return this.addStatChannel(record.RadioId)
    }
  }

  /**
 * 
 * @param {*} record - beep data
 *  
 *  get in memory stat document for a given record by channel id - create the entry if does not exist
 */
  getBluPortAndChannel(record) {
    // Object.keys(this.stats.blu_ports).forEach((port) => {
    // console.log('get blu channel port', record.UsbPort)
    let port = record.UsbPort.toString()
    let channel = record.RadioId.toString()


    if (Object.keys(this.blu_stats.blu_ports).includes(port)) {

      if (Object.keys(this.blu_stats.blu_ports[port].channels).includes(channel)) {
        return this.blu_stats.blu_ports[port].channels[channel]

      } else {
        return this.addBluStatChannel(port, channel)
      }
    } else {
      this.blu_stats.blu_ports[port] = { channels: {}, }
      if (Object.keys(this.blu_stats.blu_ports[port].channels).includes(channel)) {
        return this.blu_stats.blu_ports[port].channels[channel]

      } else {
        return this.addBluStatChannel(port, channel)
      }
    }
  }

  /**
   * 
   * @param {*} record 
   * 
   *  bump tag stats for beep
   */
  addBeep(record) {
    // console.log('regular beep record', record)
    let channel = this.getChannel(record)
    // console.log('add beep channel', channel)

    let beep_stats
    if (record.NodeId.length > 0) {
      // from a node
      beep_stats = channel.nodes.beeps
    } else {
      beep_stats = channel.beeps
    }
    if (Object.keys(beep_stats).includes(record.TagId)) {
      beep_stats[record.TagId] += 1
    } else {
      beep_stats[record.TagId] = 1
    }
    // console.log('add radio beep beep stats', beep_stats, 'global beep stats', this.stats)
  }

  /**
   * 
   * @param {*} record 
   * 
   *  bump telemetry stats for given id
   */
  addTelemetryBeep(record) {
    let channel = this.getChannel(record)
    let hardware_id = record.Id
    if (Object.keys(channel.telemetry).includes(hardware_id)) {
      channel.telemetry[hardware_id] += 1
    } else {
      channel.telemetry[hardware_id] = 1
    }
  }
  /**
   * 
   * @param {Object} record 
   */
  addBluBeep(record) {

    let port = record.UsbPort.toString()
    let channel = record.RadioId.toString()
    let blu_id = record.TagId.toString().toUpperCase();

    let stats_obj = this.getBluPortAndChannel(record) // channel is not being produced?

    let blu_stats
    if (record.NodeId.length > 0) {
      // from a node
      blu_stats = stats_obj.nodes.beeps
    } else {
      blu_stats = stats_obj.beeps ? stats_obj.beeps : 0
    }
    if (Object.keys(blu_stats).includes(blu_id)) {
      blu_stats[blu_id] += 1
    } else {
      blu_stats[blu_id] = 1
    }
  }

  /**
   * @param {Object} stats
   */
  addBluDroppedDetections(stats) {
    let port = stats.port.toString()
    let channel = stats.radio_channel.toString()
    let blu_dropped = stats.dropped_detections
    // console.log('add blu beep port', port, 'channel', channel, 'blu dropped', blu_dropped)

    let stats_obj = this.getBluPortAndChannel({ UsbPort: port, RadioId: channel }) // channel is not being produced?
    // console.log('add blu beep channel blu dropped', stats_obj)
    let blu_stats = stats_obj.blu_dropped ? stats_obj.blu_dropped : 0
    // console.log('add blu dropped before addition', blu_stats)

    // blu_stats += blu_dropped
    this.blu_stats.blu_ports[port].channels[channel].blu_dropped += blu_dropped
    // console.log('add blu dropped after addition', blu_stats)


    // console.log('add blu dropped function blu_stats', blu_stats, 'global blu dropped', this.blu_stats.blu_ports[port].channels[channel].blu_dropped)
  }
  /**
   * 
   * @param {*} record 
   * 
   *  add node health report to health document for given node
   */
  addNodeHealth(record) {
    let channel = this.getChannel(record)
    let node_id = record.NodeId
    delete record.NodeId
    channel.nodes.health[node_id] = record
  }

}
export { BeepStatManager }
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
      blu_ports: { // redo this without defined port numbers
        // "1": { channels: {}, },
        // "2": { channels: {}, },
        // "3": { channels: {}, },
        // "4": { channels: {}, },
        // "5": { channels: {}, },
        // "6": { channels: {}, },
      },
    }
  }

  /**
   * 
   */
  addBluStatChannel(port, channel) {
    let blu_channel_data = {
      blu_beeps: {},
      blu_dropped: {},
    }
    this.stats.blu_ports[port].channels[channel] = blu_channel_data
    console.log('add blu stat channel blu data', blu_channel_data)
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
      blu_beeps: {},
      blu_dropped: {},
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
  getBluChannel(record) {
    // Object.keys(this.stats.blu_ports).forEach((port) => {
    console.log('get blu channel port', record.UsbPort)
    let port = record.UsbPort.toString()
    let channel = record.RadioId.toString()
    if (Object.keys(this.stats.blu_ports).includes(port)) {

      if (Object.keys(this.stats.blu_ports[port]).includes(channel)) {
        console.log('get blu channel port and radio id', this.stats.blu_ports[port])
        return this.stats.blu_ports[port].channels[channel]

      } else {
        return this.addBluStatChannel(record.UsbPort, record.RadioId)
      }
    } else {
      this.stats.blu_ports[port] = { channels: {}, }
    }
    // })
    // console.log('get blu channel stats', JSON.stringify(this.stats.blu_ports))
    // if (Object.keys(this.stats.blu_ports).includes(record.RadioId.toString())) {
    //   return this.stats.channels[record.RadioId]
    // } else {
    //   return this.addStatChannel(record.RadioId)
    // }
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
    // console.log('add blu beep record', record)
    console.log('add blu beep stats', this.stats.blu_ports)

    let channel = this.getBluChannel(record)
    console.log('add blu beep channel', channel)
    let blu_stats
    if (record.NodeId.length > 0) {
      // from a node
      blu_stats = channel.nodes.blu_beeps
    } else {
      blu_stats = channel.blu_beeps
    }
    if (Object.keys(blu_stats).includes(record.TagId)) {
      blu_stats[record.TagId] += 1
    } else {
      blu_stats[record.TagId] = 1
    }
    console.log('add blu beep blu stats', blu_stats)
  }

  /**
   * @param {Object} stats
   */
  getDroppedDetections(stats) {
    let channel = this.getBluChannel(stats)
    console.log('get dropped detections channel', channel)
    let blu_dropped
    blu_dropped = channel.blu_dropped + blu_dropped
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
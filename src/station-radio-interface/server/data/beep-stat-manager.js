/**
 * class for managing tag stats
 */
class BeepStatManager {
  /**
   * initialize stats document
   */
  constructor() {
    this.stats = {
      channels: {}
    }
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
      // console.log('get blu channel record', record)
      // if (Object.keys(this.stats.channels).includes(record.BluRadioId.toString())) {
      //   return this.stats.channels[record.BluRadioId]
      // } else {
      //   return this.addStatChannel(record.BluRadioId)
      // }
      if (Object.keys(this.stats.channels).includes(record.RadioId.toString())) {
        return this.stats.channels[record.RadioId]
      } else {
        return this.addStatChannel(record.RadioId)
      }
    }

  /**
   * 
   * @param {*} record 
   * 
   *  bump tag stats for beep
   */
  addBeep(record) {
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
    let channel = this.getBluChannel(record)
    // console.log('add blu beep channel', channel)
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
  }

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
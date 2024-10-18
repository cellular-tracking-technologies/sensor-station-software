import moment from 'moment'
import { NodeMetaManager } from './node-meta-manager.js'

/**
 * file formatter for Node Meta Data files
 */
class NodeMetaData {
  /**
   * 
   * @param {*} opts 
   */
  constructor(opts) {
    this.header = [
      'DataType',
      'NodeSource',
      'Date',
      'CollectionId',
      'CollectionIndex',
      'RSSI',
      'Protocol',
    ]
    this.date_format = opts.date_format
    this.packet = {
      nodes: {},
    }
    this.node_meta = new NodeMetaManager({
      date_format: this.date_format,
    })
  }

  /**
   * @param {Object} record - Node meta data
   */

  formatRecord(record) {
    const fields = this.node_meta.addNode(record)

    if (fields) {
      return fields
    }

  }
}

export { NodeMetaData }
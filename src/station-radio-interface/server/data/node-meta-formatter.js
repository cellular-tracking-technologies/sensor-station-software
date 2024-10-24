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
      'Protocol',
      'CollectionId',
      'MissingIndexStart',
      'MissingIndexEnd',
      'NumberMissing',
      'TotalMissingFromCollection',
      'PercentLoss',
      'PercentSuccess',
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
    try {

      // console.log('format record record', record)
      const fields = this.node_meta.addNode(record)
      if (fields) {
        // console.log('format record fields', fields)

        return fields
      }
    } catch (err) {
      console.error('node meta error', err)
    }

  }
}

export { NodeMetaData }
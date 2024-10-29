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
      'Protocol',
      'StartDate',
      'EndDate',
      'CollectionId',
      'CollectionCount',
      'MissingBeeps',
    ]
    this.date_format = opts.date_format

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
      // console.log('format record fields', fields)
      if (fields) {
        return fields
      }
    } catch (err) {
      console.error('node meta error', err)
    }

  }
}

export { NodeMetaData }
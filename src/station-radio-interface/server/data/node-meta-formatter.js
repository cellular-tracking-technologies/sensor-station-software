import moment from 'moment'
import MessageTypes from '../../../hardware/ctt/messages.js'

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
      'CollectionId',
      'CollectionCount',
      'CollectionIndex',
      'RSSI',
      'Protocol',
    ]
    this.date_format = opts.date_format
    this.count_collection = 49
    this.collection_array = []
    this.collect_id
    this.node_id
    this.idx
    this.packet = {
      nodes: {},
    }
  }

  /**
   * @param {Object} record - Node meta data
   */
  addNode(record) {
    try {
      const {
        meta: { source: { id: node_id },
          collection: { id: collect_id, idx } },
      } = record

      let fields

      // clear packet.nodes object of previous data after collection number restarts
      if (collect_id == 0 && idx == 0) {
        delete this.packet.nodes[node_id]
        console.log('packet counter reset, clear existing packets', JSON.stringify(this.packet.nodes, null, 2))
      }

      // if node is present in object
      if (Object.keys(this.packet.nodes).includes(node_id)) {
        fields = this.updateCollection(record)
      } else {
        // add new node object if not present
        let collections = { collections: {} }
        this.packet.nodes[node_id] = collections

        this.addNewCollection(record)
        console.log('new node added', JSON.stringify(this.packet.nodes, null, 2))
      }

      if (fields) {
        console.log('fields', fields)
        return fields
      }

    } catch (err) {
      console.error('addNode error', err)
    }
  }

  /**
   * 
   * @param {Number} idx - index of collection id
   */
  updateCollection(record) {
    try {
      const {
        meta: {
          data_type,
          source: { id: node_id },
          collection: { id: collect_id, idx },
        },
        data: { rec_at },
      } = record

      const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)
      let fields

      if (Object.keys(this.packet.nodes[node_id].collections)
        .includes(collect_id.toString())) {

        // get previous index from collection
        let iterate = this.packet.nodes[node_id].collections[collect_id]

        // console.log('collection id', collect_id, 'idx', idx, 'iterate', iterate)

        // check if index is sequential
        if (idx !== iterate + 1) {
          console.log('missing packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
          fields = [
            node_id,
            data_type,
            recorded_at,
            collect_id,
            idx - 1,
          ]

          // reset iterate to match idx
          iterate = idx - 1
        }
        this.packet.nodes[node_id].collections[collect_id] = iterate += 1
        // console.log('existing collection updated', JSON.stringify(this.packet.nodes, null, 2))
      } else {
        fields = this.addNewCollection(record)
      }

      if (fields)
        return fields

    } catch (err) {
      console.error('updateCollection error', err)
    }
  }

  /**
   * 
   * @param {Number} idx - index of collection id
   */
  addNewCollection(record) {
    const {
      meta: {
        source: { id: node_id },
        collection: { id: collect_id, idx },
      },

    } = record

    let fields
    try {

      if (idx - 1 == 0) {
        console.log('missing index 0 packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
        fields = [
          node_id,
          data_type,
          recorded_at,
          collect_id,
          idx - 1,
        ]
      }
      this.packet.nodes[node_id].collections[collect_id] = idx
      console.log('new collection added', JSON.stringify(this.packet.nodes, null, 2))

      if (fields)
        return fields
    } catch (err) {
      console.error('addNewCollection error', err)
    }
  }

  /**
   * @param {Object} record - Node meta data
   */

  formatRecord(record) {
    try {

      const fields = this.addNode(record)

      // if (fields)
      // return fields
    } catch (err) {
      console.error('node meta data format record error', err)
    }
  }
}

export { NodeMetaData }
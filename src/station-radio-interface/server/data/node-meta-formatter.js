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
            let {
                protocol,
                meta: {
                    data_type,
                    source: {
                        type,
                        id: node_id,
                    },
                    collection: { id: collect_id, count, idx },
                    rssi,
                },
                data: {
                    rec_at,
                },
                received_at,
            } = record

            // console.log('idx', idx)
            let recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)

            let node_data = {
                node_type: {},
            }

            let counter, fields

            if (Object.keys(this.packet.nodes).includes(node_id)) {
                // this.packet.nodes[node_id].node_type[data_type].collections[collect_id] = counter++
                // console.log('existing node updated', JSON.stringify(this.packet.nodes, null, 2))

                fields = this.addNodeType(counter, record, recorded_at)
            } else {
                // counter = idx
                this.packet.nodes[node_id] = node_data
                // this.packet.nodes[node_id].node_type[data_type] = collections
                // this.packet.nodes[node_id].node_type[data_type].collections[collect_id] = counter
                this.addNewCollection(counter, record)
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
     * @param {Number} counter - program counting index to compare; used to find missing packets
     * @param {Number} idx - index of collection id
     */
    addNodeType(counter, record, recorded_at) {
        try {
            let {
                protocol,
                meta: {
                    data_type,
                    source: {
                        type,
                        id: node_id,
                    },
                    collection: { id: collect_id, count, idx },
                    rssi,
                },
                data: {
                    rec_at,
                },
                received_at,
            } = record

            let fields

            if (Object.keys(this.packet.nodes[node_id].node_type).includes(data_type)) {
                // this.packet.nodes[node_id].node_type[data_type].collections[collect_id] = counter++
                // console.log('existing node type updated', JSON.stringify(this.packet.nodes, null, 2))

                fields = this.addCollection(counter, record, recorded_at)
            } else {
                this.addNewCollection(counter, record)
                // counter = idx
                // this.packet.nodes[node_id].node_type[data_type] = collections
                // this.packet.nodes[node_id].node_type[data_type].collections[collect_id] = counter
                // console.log('new node type added', JSON.stringify(this.packet.nodes, null, 2))
            }

            if (fields)
                return fields
        } catch (err) {
            console.error('addNodeType error', err)
        }
    }

    /**
     * 
     * @param {Number} counter - program counting index to compare; used to find missing packets
     * @param {Number} idx - index of collection id
     */
    addCollection(counter, record, recorded_at) {
        try {
            let {
                protocol,
                meta: {
                    data_type,
                    source: {
                        type,
                        id: node_id,
                    },
                    collection: { id: collect_id, count, idx },
                    rssi,
                },
                data: {
                    rec_at,
                },
                received_at,
            } = record
            let fields
            if (Object.keys(this.packet.nodes[node_id].node_type[data_type].collections).includes(collect_id.toString())) {
                let iterate = this.packet.nodes[node_id].node_type[data_type].collections[collect_id]
                // console.log('iterate', iterate, 'idx', idx)
                if (idx !== iterate + 1) {
                    console.log('missing packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
                    fields = [
                        node_id,
                        data_type,
                        recorded_at,
                        collect_id,
                        idx - 1,
                        // iterate + 1,
                    ]
                    // reset iterate to match idx
                    iterate = idx - 1
                }
                this.packet.nodes[node_id].node_type[data_type].collections[collect_id] = iterate += 1

            } else {
                counter = idx
                // this.packet.nodes[node_id].node_type[data_type] = collections
                this.packet.nodes[node_id].node_type[data_type].collections[collect_id] = counter
                console.log('new collection added', JSON.stringify(this.packet.nodes, null, 2))
            }

            if (fields)
                return fields

        } catch (err) {
            console.error('addCollection error', err)
        }
    }

    /**
     * 
     * @param {Number} counter - program counting index to compare; used to find missing packets
     * @param {Number} idx - index of collection id
     */
    addNewCollection(counter, record) {
        let {
            protocol,
            meta: {
                data_type,
                source: {
                    type,
                    id: node_id,
                },
                collection: { id: collect_id, count, idx },
                rssi,
            },
            data: {
                rec_at,
            },
            received_at,
        } = record
        try {
            let collections = { collections: {} }
            counter = idx
            this.packet.nodes[node_id].node_type[data_type] = collections
            this.packet.nodes[node_id].node_type[data_type].collections[collect_id] = counter
            console.log('new collection added', JSON.stringify(this.packet.nodes, null, 2))
        } catch (err) {
            console.error('addNewCollection error', err)
        }
    }

    /**
     * @param {Object} record - Node meta data
     */

    formatRecord(record) {

        try {
            let fields = this.addNode(record)

            if (fields)
                return fields
        } catch (err) {
            console.error('node meta data format record error', err)
        }
    }
}

export { NodeMetaData }
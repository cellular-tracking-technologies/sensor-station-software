import moment from 'moment'

/**
 * file formatter for Node Meta Data files
 */
class NodeMetaManager {
    /**
     * 
     * @param {*} opts 
     */
    constructor(opts) {
        this.date_format = opts.date_format
        this.packet = {
            nodes: {},
        }
    }

    /**
     * @param {Object} record - Node meta data
     */
    addNode(record) {
        const {
            meta: { source: { id: node_id },
                collection: { id: collect_id, idx },
            },
        } = record

        let fields

        // clear packet.nodes object of previous data after collection id restarts
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
            console.log('add node fields', fields)
            return fields
        }
    }

    /**
     * 
     * @param {Number} idx - index of collection id
     */
    updateCollection(record) {
        const {
            protocol,
            meta: {
                data_type,
                source: { id: node_id },
                collection: { id: collect_id, idx },
                rssi,
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

                fields = this.createFields(record)

                // reset iterate to match idx
                iterate = idx - 1
            }
            this.packet.nodes[node_id].collections[collect_id] = iterate += 1
            // console.log('existing collection updated', JSON.stringify(this.packet.nodes, null, 2))
        } else {
            fields = this.addNewCollection(record)
        }

        if (fields) {
            console.log('update collection fields', fields)
            return fields
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

        if (idx - 1 == 0) {
            console.log('missing index 0 packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
            fields = this.createFields(record)
        }
        this.packet.nodes[node_id].collections[collect_id] = idx
        console.log('new collection added', JSON.stringify(this.packet.nodes, null, 2))

        if (fields) {
            console.log('new collection fields', fields)
            return fields
        }
    }

    createFields(record) {
        const {
            protocol,
            meta: {
                data_type,
                source: { id: node_id },
                collection: { id: collect_id, idx },
                rssi,
            },
            data: { rec_at },
        } = record

        const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)

        let fields = [
            node_id,
            data_type,
            recorded_at,
            collect_id,
            idx - 1,
            rssi,
            protocol,
        ]
        return fields
    }

}

export { NodeMetaManager }
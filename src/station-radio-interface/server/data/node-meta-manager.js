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
            meta: {
                data_type,
                source: { id: node_id },
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
            // console.log('add node fields', fields)
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

        let fields

        if (Object.keys(this.packet.nodes[node_id].collections)
            .includes(collect_id.toString())) {

            // get previous index from collection
            let iterate = this.packet.nodes[node_id].collections[collect_id].idx

            // check if index is sequential
            if (idx !== iterate + 1) {
                console.log('missing packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
                console.log('array of missing values', this.range(iterate + 1, idx, 1))

                let missing_values = this.range(iterate + 1, idx, 1)

                missing_values.forEach((value) => {
                    fields = this.createFields(record, value)
                })

                // fields = this.createFields(record)

                // reset iterate to match idx
                iterate = idx - 1

                // console.log('existing collection updated', JSON.stringify(this.packet.nodes, null, 2))
            }

            this.packet.nodes[node_id].collections[collect_id].idx = idx
            this.packet.nodes[node_id].collections[collect_id].collections_sent += 1

            let collections_sent = this.packet.nodes[node_id].collections[collect_id].collections_sent
            this.packet.nodes[node_id].collections[collect_id].percent_success = Math.round((collections_sent / 50) * 100)
            // console.log('collection missing last packet', Object.values(this.packet.nodes[node_id].collections)[index - 1])

        } else {
            fields = this.addNewCollection(record)
        }

        if (fields) {
            // console.log('update collection fields', fields)
            return fields
        }
    }

    /**
     * 
     * @param {Number} idx - index of collection id
     */
    addNewCollection(record) {
        let {
            meta: {
                data_type,
                source: { id: node_id },
                collection: { id: collect_id, idx },
                rssi,
            },
            data: { rec_at },
        } = record

        const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)

        if (node_id.length < 8) {
            // record.collection.idx = 0
            console.log('v2 node record', record)
        }

        let fields

        if (idx - 1 == 0) {
            console.log('missing index 0 packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
            fields = this.createFields(record, 0)
        }

        this.packet.nodes[node_id].collections[collect_id] = {
            idx: idx,
            collections_sent: 1,
            percent_success: (1 / 50) * 100,
            data_type,
        }

        // check if previous collection did not get last beep
        // console.log('new collection added', JSON.stringify(this.packet.nodes, null, 2))
        let index = Object.keys(this.packet.nodes[node_id].collections).findIndex((el) => Number(el) == collect_id)

        // if v3 node is missing last beep
        if (node_id.length == 8 && Object.values(this.packet.nodes[node_id].collections)[index - 1].idx !== 49) {
            // console.log('collection missing last packet', Object.values(this.packet.nodes[node_id].collections)[index - 1])
            console.log('collection missing last packet', Object.values(this.packet.nodes[node_id].collections)[index - 1])

            fields = [
                node_id,
                Object.values(this.packet.nodes[node_id].collections)[index - 1].data_type,
                null,
                Object.keys(this.packet.nodes[node_id].collections)[index - 1],
                49,
                null,
                null,
            ]
        }

        // if v2 node is missing last beep
        if (node_id.length < 8 && Object.values(this.packet.nodes[node_id].collections)[index - 1].idx !== 50) {
            // console.log('collection missing last packet', Object.values(this.packet.nodes[node_id].collections)[index - 1])
            console.log('collection missing last packet in v2 node', Object.values(this.packet.nodes[node_id].collections)[index - 1])

            fields = [
                node_id,
                Object.values(this.packet.nodes[node_id].collections)[index - 1].data_type,
                null,
                Object.keys(this.packet.nodes[node_id].collections)[index - 1],
                50,
                null,
                null,
            ]
        }

        if (fields) {
            console.log('new collection fields', fields)
            return fields
        }
    }

    createFields(record, value) {
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
            // idx - 1,
            value,
            rssi,
            protocol,
        ]
        console.log('create fields', fields)
        return fields
    }

    /**
 * 
 * @param {Number} start - Start of the sequence
 * @param {Number} stop - End of the sequence 
 * @param {Number} step - How much to increase the sequence 
 * @returns 
 */
    range(start, stop, step) {

        return Array.from(
            { length: Math.ceil((stop - start) / step) },
            (_, i) => start + i * step,
        );
    }

}

export { NodeMetaManager }
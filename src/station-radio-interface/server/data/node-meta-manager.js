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
        // console.log('add node record', record)
        const {
            meta: { source: { id: node_id } },
            received_at
        } = record

        let fields

        // if node is present in object
        if (Object.keys(this.packet.nodes).includes(node_id)) {
            fields = this.updateCollection(record)
        } else {
            // add new node object if not present
            let collections = { collections: {} }
            this.packet.nodes[node_id] = collections
            this.addNewCollection(record)
        }

        if (fields) {
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
            received_at
        } = record

        const recorded_at = moment(new Date(received_at * 1000)).utc().format(this.date_format)
        let fields, min, max, num_missing

        if (Object.keys(this.packet.nodes[node_id].collections)
            .includes(collect_id.toString())) {

            // get previous index from collection
            let iterate = this.packet.nodes[node_id].collections[collect_id].idx

            // check if index is sequential, and if idx is greater than the iterate (nodes are sending previous received beeps???)
            if (idx !== iterate + 1 && idx > iterate + 1) {
                console.log('node id', node_id, 'collect id', collect_id, 'idx should be', iterate + 1, 'but it is', idx)

                let missing = this.getMinMax(iterate + 1, idx)
                min = missing.min
                max = missing.max
                num_missing = (max - min) + 1
                console.log('update collection missing values', node_id, collect_id, missing)

                fields = this.createFields(protocol, data_type, node_id, collect_id, rssi, recorded_at, min, max, num_missing)

                console.log('update collection fields', fields)

                // reset iterate to match idx
                iterate = idx - 1
            }

            this.packet.nodes[node_id].collections[collect_id].idx = idx
            this.packet.nodes[node_id].collections[collect_id].collections_sent += 1

            let collections_sent = this.packet.nodes[node_id].collections[collect_id].collections_sent
            this.packet.nodes[node_id].collections[collect_id].percent_success = Math.round((collections_sent / 50) * 100)
            this.packet.nodes[node_id].collections[collect_id].recorded_at = recorded_at
            this.packet.nodes[node_id].collections[collect_id].missing = num_missing ? this.packet.nodes[node_id].collections[collect_id].missing + num_missing : this.packet.nodes[node_id].collections[collect_id].missing + 0

        } else {
            fields = this.addNewCollection(record)
        }

        // clear packet.nodes object of previous data after collection id restarts
        this.clearNodePackets(node_id, collect_id)

        if (fields)
            return fields
    }

    clearNodePackets(node_id, collect_id) {
        console.log('collections sent', this.packet.nodes[node_id].collections[collect_id].collections_sent)
        // clear v3 node objects
        if (Object.keys(this.packet.nodes[node_id]?.collections).length >= 10 && this.packet.nodes[node_id].collections[collect_id].collections_sent === 50) {
            this.packet.nodes[node_id].collections = {}
            console.log('node', node_id, 'collections deleted', Object.keys(this.packet.nodes[node_id]?.collections).length)
        }
        console.log('nodes length', Object.keys(this.packet.nodes[node_id]?.collections).length)
    }


    /**
     * 
     * @param {Number} idx - index of collection id
     */
    addNewCollection(record) {
        // console.log('add new collection record', record)
        let {
            protocol,
            meta: {
                data_type,
                source: { id: node_id },
                collection: { id: collect_id, idx },
                rssi,
            },
            received_at
        } = record

        // const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)
        const recorded_at = moment(new Date(received_at * 1000)).utc().format(this.date_format)
        let fields, min, max, num_missing

        if (idx !== 0) {
            console.log('no starting idx array of missing values', this.range(0, idx, 1))

            // create a range of missing values, from 0 to whatever the idx is
            let missing = this.getMinMax(0, idx)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
            console.log('add new collection missing values', node_id, collect_id, missing)

            fields = this.createFields(protocol, data_type, node_id, collect_id, rssi, recorded_at, min, max, num_missing)
            console.log('add new collection fields', fields)
        }

        this.packet.nodes[node_id].collections[collect_id] = {
            idx: idx,
            collections_sent: 1,
            percent_success: (1 / 50) * 100,
            missing: num_missing ? num_missing : 0,
            data_type,
            recorded_at,
        }

        console.log('add new collection', this.packet.nodes[node_id].collections)

        // check if previous collection is missing last beep - need to work on logic for checking previous collections
        if (this.packet.nodes[node_id].collections[collect_id - 1] && this.packet.nodes[node_id].collections[collect_id - 1].idx !== 49) {

            // check if previous collection is missing last beep
            console.log('previous collection id is missing last beep', this.packet.nodes[node_id].collections[collect_id - 1], 'current collection id', collect_id)
            fields = this.checkPreviousCollection(record)
            // console.log('v2 node fields', fields)
        }

        if (fields) {
            // console.log('new collection fields', fields)
            return fields
        }
    }

    checkPreviousCollection(record) {
        let {
            protocol,
            meta: {
                data_type,
                source: { id: node_id },
                collection: { id: collect_id, idx },
                rssi,
            },
        } = record

        // check if previous collection did not get last beep
        let index = Object.keys(this.packet.nodes[node_id].collections).findIndex((el) => Number(el) == collect_id)
        let fields, min, max, num_missing

        // if v3 node is missing last beep
        if (node_id.length == 8 && Object.values(this.packet.nodes[node_id].collections)[index - 1]?.idx !== 49) {

            const { prev_collect, prev_idx, prev_recordat } = this.getPreviousCollection(node_id, index)
            console.log(' v3 previous collection', prev_collect, prev_idx, prev_recordat)
            console.log('v3 node array of missing values', this.range(prev_idx + 1, 50, 1))

            let missing = this.getMinMax(prev_idx + 1, 50, 1)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
            console.log('v3 node min max', min, max, num_missing)

            fields = this.createFields(protocol, data_type, node_id, prev_collect, rssi, prev_recordat, min, max, num_missing)
            console.log('v3 node fields', fields)
        }

        // if v2 node is missing last beep
        if (node_id.length < 8 && Object.values(this.packet.nodes[node_id].collections)[index - 1].idx !== 50) {

            const { prev_collect, prev_idx, prev_recordat } = this.getPreviousCollection(node_id, index)
            console.log('v2 node array of missing values', this.range(prev_idx + 1, 51, 1))

            let missing = this.getMissingValues(prev_idx + 1, 51)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1

            console.log('v2 node min max', min, max, num_missing)

            fields = this.createFields(protocol, data_type, node_id, prev_collect, rssi, prev_recordat, min, max, num_missing)
            console.log('v2 node fields', fields)
        }

        if (fields) {
            // console.log('new collection fields', fields)
            return fields
        }
    }

    /**
     * 
     * @param {String} protocol 
     * @param {String} data_type 
     * @param {String} node_id 
     * @param {Number} collect_id 
     * @param {Number} rssi 
     * @param {DateTime} rec_at 
     * @param {Number} min 
     * @param {Number} max 
     * @param {Number} num_missing 
     * @returns {Array} fields
     */

    createFields(protocol, data_type, node_id, collect_id, rssi, recorded_at, min, max, num_missing) {
        console.log('create fields min', min, 'max', max, 'num missing', num_missing)
        // const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)

        let current_missing = this.packet.nodes[node_id].collections[collect_id]?.missing ?? 0
        let total_missing = current_missing + num_missing
        let percent_loss = Math.floor((total_missing / 50) * 100)
        let percent_success = 100 - percent_loss

        console.log('create fields current missing', current_missing, 'total missing', total_missing, 'percent loss', percent_loss, 'percent success', percent_success)

        let fields = [
            node_id,
            data_type,
            recorded_at,
            protocol,
            collect_id,
            min,
            max,
            num_missing,
            total_missing,
            percent_loss,
            percent_success,
        ]
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

    getMinMax(start, stop) {
        console.log('getMinMax start', start, 'stop', stop)
        let missing_values = this.range(start, stop, 1)
        let min = Math.min(...missing_values)
        let max = Math.max(...missing_values)
        console.log('get min', min, 'get max', max)
        return { min, max }
    }

    getPreviousCollection(node_id, index) {
        const prev_collect = Object.keys(this.packet.nodes[node_id].collections)[index - 1]
        const prev_idx = Object.values(this.packet.nodes[node_id].collections)[index - 1]?.idx
        const prev_recordat = Object.values(this.packet.nodes[node_id].collections)[index - 1]?.recorded_at

        return { prev_collect, prev_idx, prev_recordat }
    }

}

export { NodeMetaManager }
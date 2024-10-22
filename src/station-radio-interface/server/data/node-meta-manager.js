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
            meta: {
                data_type,
                source: { id: node_id },
                collection: { id: collect_id, idx },
            },
            data: { rec_at },

        } = record

        const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)

        let fields

        // clear packet.nodes object of previous data after collection id restarts
        if (collect_id == 0 && recorded_at !== this.packet.nodes[node_id].collections[collect_id]?.recorded_at) {
            // if (collect_id == 0 && idx == 0) {
            console.log('previous beeps in collection id', this.packet.nodes[node_id].collections)
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
            // console.log('new node added', JSON.stringify(this.packet.nodes, null, 2))
            // console.log('new node added', this.packet.nodes)
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
        // console.log('updateCollection record', record)
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
        // console.log('updateCollection record', record)
        const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)


        let fields, min, max, num_missing
        // let fields_array = []

        if (Object.keys(this.packet.nodes[node_id].collections)
            .includes(collect_id.toString())) {

            // get previous index from collection
            let iterate = this.packet.nodes[node_id].collections[collect_id].idx

            // check if index is sequential
            if (idx !== iterate + 1) {
                // console.log('updateCollection missing packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
                // console.log('updateCollection array of missing values', this.range(iterate + 1, idx, 1))

                let missing = this.getMinMax(iterate + 1, idx)
                min = missing.min
                max = missing.max
                num_missing = (max - min) + 1

                fields = this.createFields(record, min, max, num_missing)
                console.log('update collection fields', fields)

                // reset iterate to match idx
                iterate = idx - 1
            }

            // num_missing ? num_missing : 0
            // console.log('update collection number missing', num_missing)

            // console.log('update collection missing', this.packet.nodes[node_id].collections[collect_id].missing)


            this.packet.nodes[node_id].collections[collect_id].idx = idx
            this.packet.nodes[node_id].collections[collect_id].collections_sent += 1

            let collections_sent = this.packet.nodes[node_id].collections[collect_id].collections_sent
            this.packet.nodes[node_id].collections[collect_id].percent_success = Math.round((collections_sent / 50) * 100)
            this.packet.nodes[node_id].collections[collect_id].recorded_at = recorded_at
            this.packet.nodes[node_id].collections[collect_id].missing = num_missing ? this.packet.nodes[node_id].collections[collect_id].missing + num_missing : this.packet.nodes[node_id].collections[collect_id].missing + 0

            // console.log('update collection missing', this.packet.nodes[node_id].collections[collect_id].missing)
            // console.log('existing collection updated', JSON.stringify(this.packet.nodes, null, 2))
            // console.log('existing collection updated', this.packet.nodes)
        } else {
            fields = this.addNewCollection(record)
        }

        if (fields)
            return fields
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
            data: { rec_at },
        } = record

        const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)

        let fields, min, max, num_missing

        if (idx !== 0) {
            // console.log('missing index 0 packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)

            // console.log('missing packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
            console.log('no starting idx array of missing values', this.range(0, idx, 1))

            // create a range of missing values, from 0 to whatever the idx is
            let missing = this.getMinMax(0, idx)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1


            fields = this.createFields(record, min, max, num_missing)
            console.log('add new collection fields', fields)
            // console.log('new collection updated', this.packet.nodes)
            // console.log('new collection updated', JSON.stringify(this.packet.nodes, null, 2))
        }

        this.packet.nodes[node_id].collections[collect_id] = {
            idx: idx,
            collections_sent: 1,
            percent_success: (1 / 50) * 100,
            missing: num_missing ? num_missing : 0,
            data_type,
            recorded_at,
        }
        console.log('add new collection missing', this.packet.nodes[node_id].collections[collect_id].missing)


        // need to work on logic for checking previous collections
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
            data: { rec_at },
        } = record

        // const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)

        // check if previous collection did not get last beep
        let index = Object.keys(this.packet.nodes[node_id].collections).findIndex((el) => Number(el) == collect_id)
        // console.log('current index', index)

        let fields, min, max, num_missing, total_missing

        // if v3 node is missing last beep
        if (node_id.length == 8 && Object.values(this.packet.nodes[node_id].collections)[index - 1]?.idx !== 49) {

            const { prev_collect, prev_idx, prev_recordat } = this.getPreviousCollection(node_id, index)
            console.log(' v3 previous collection', prev_collect, prev_idx, prev_recordat)
            console.log('v3 node array of missing values', this.range(prev_idx + 1, 50, 1))

            let missing = this.getMinMax(prev_idx + 1, 50, 1)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
            let current_missing = this.packet.nodes[node_id].collections[collect_id]?.missing
            console.log('v3 node min max', min, max, num_missing)

            // const { num_missing, percent_loss, percent_success } = this.getMissingStats(min, max)

            fields = [
                node_id,
                this.packet.nodes[node_id].collections[prev_collect].data_type,
                prev_recordat,
                prev_collect,
                min, // missing idx start
                max, // missing idx end
                num_missing,
                total_missing = current_missing ? current_missing + num_missing : num_missing,

                // percent_loss,
                // percent_success,
                rssi, //rssi
                protocol, // protocol
            ]
            console.log('v3 node fields', fields)

        }

        // if v2 node is missing last beep
        if (node_id.length < 8 && Object.values(this.packet.nodes[node_id].collections)[index - 1].idx !== 50) {

            const { prev_collect, prev_idx, prev_recordat } = this.getPreviousCollection(node_id, index)
            console.log('v2 node array of missing values', this.range(prev_idx + 1, 51, 1))

            // let missing_values = this.range(prev_idx + 1, 51, 1)
            let missing = this.getMissingValues(prev_idx + 1, 51)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1

            let current_missing = this.packet.nodes[node_id].collections[collect_id]?.missing
            console.log('v2 node min max', min, max, num_missing)


            // const { num_missing, percent_loss, percent_success } = this.getMissingStats(min, max)

            fields = [
                node_id,
                this.packet.nodes[node_id].collections[prev_collect].data_type,
                prev_recordat,
                prev_collect,
                min, // missing idx start
                max, // missing idx end
                num_missing,
                total_missing = current_missing ? current_missing + num_missing : num_missing,

                // percent_loss,
                // percent_success,
                rssi, //rssi
                protocol, // protocol
            ]
            console.log('v2 node fields', fields)

        }

        if (fields) {
            // console.log('new collection fields', fields)
            return fields
        }
    }

    createFields(record, min, max, num_missing) {
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

        // const { num_missing, percent_loss, percent_success } = this.getMissingStats(min, max)

        let current_missing = this.packet.nodes[node_id].collections[collect_id]?.missing
        console.log('create fields current missing', current_missing)
        let total_missing

        let fields = [
            node_id,
            data_type,
            recorded_at,
            collect_id,
            min,
            max,
            num_missing,
            total_missing = current_missing ? current_missing + num_missing : num_missing,
            // percent_loss = ,
            // percent_success,
            rssi,
            protocol,
        ]
        // console.log('create fields', fields)
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
        let missing_values = this.range(start, stop, 1)
        console.log('missing values', missing_values)
        let min = Math.min(...missing_values)
        let max = Math.max(...missing_values)
        console.log('get min', min, 'get max', max)
        return { min, max }
    }

    getMissingStats(min, max) {
        const num_missing = (max - min) + 1
        const percent_loss = (num_missing / 50) * 100
        const percent_success = 100 - percent_loss
        console.log('num_missing', num_missing, 'percent loss', percent_loss, 'percent_success', percent_success)

        return { num_missing, percent_loss, percent_success }
    }

    getPreviousCollection(node_id, index) {
        const prev_collect = Object.keys(this.packet.nodes[node_id].collections)[index - 1]
        const prev_idx = Object.values(this.packet.nodes[node_id].collections)[index - 1]?.idx
        const prev_recordat = Object.values(this.packet.nodes[node_id].collections)[index - 1]?.recorded_at

        return { prev_collect, prev_idx, prev_recordat }
    }

}

export { NodeMetaManager }
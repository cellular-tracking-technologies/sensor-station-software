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
            // console.log('packet counter reset, clear existing packets', JSON.stringify(this.packet.nodes, null, 2))
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
        }

        if (fields) {
            // console.log('add node fields', fields)
            // for (let i = 0; i < fields.length; i++) {
            //     return fields.shift
            // }
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
        // console.log('updateCollection record', record)
        const recorded_at = moment(new Date(rec_at * 1000)).utc().format(this.date_format)


        let fields
        // let fields_array = []

        if (Object.keys(this.packet.nodes[node_id].collections)
            .includes(collect_id.toString())) {

            // get previous index from collection
            let iterate = this.packet.nodes[node_id].collections[collect_id].idx

            // check if index is sequential
            if (idx !== iterate + 1) {
                // console.log('updateCollection missing packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
                // console.log('updateCollection array of missing values', this.range(iterate + 1, idx, 1))

                let missing_values = this.range(iterate + 1, idx, 1)
                // fields = this.findMissingValues(missing_values, record)

                fields = missing_values.flatMap((value, i, arr) => {
                    // console.log('update collection missing values arr', arr)
                    let fields_array = []
                    fields_array.push(this.createFields(record, value))
                    // let fields_array = this.createFields(record, value)
                    if (arr.length > 1) {

                        fields_array.push(['\n'])

                        // remove last newline
                        if (i + 1 == arr.length) {
                            fields_array.splice(-1)
                        }
                    }
                    // console.log('update collection fields array', fields_array)

                    return fields_array
                })
                // console.log('forEach fields out of loop', fields)

                // reset iterate to match idx
                iterate = idx - 1
                // console.log('existing collection updated', JSON.stringify(this.packet.nodes, null, 2))
            }

            this.packet.nodes[node_id].collections[collect_id].idx = idx
            this.packet.nodes[node_id].collections[collect_id].collections_sent += 1

            let collections_sent = this.packet.nodes[node_id].collections[collect_id].collections_sent
            this.packet.nodes[node_id].collections[collect_id].percent_success = Math.round((collections_sent / 50) * 100)
            this.packet.nodes[node_id].collections[collect_id].recorded_at = recorded_at
            // console.log('collection missing last packet', Object.values(this.packet.nodes[node_id].collections)[index - 1])

        } else {
            fields = this.addNewCollection(record)
        }

        if (fields)
            return fields
    }

    returnFields(fields) {
        // console.log('return fields', fields)
        return fields
    }

    findMissingValues(missing_values, record) {
        let fields
        // missing_values.forEach((value) => {
        //     console.log('missing values', value)
        //     fields = this.createFields(record, value)
        //     console.log('find missing values fields', fields)
        // })
        for (const i of missing_values) {
            // console.log('missing values', i)
            fields = this.createFields(record, i)
        }

        // if (fields)
        return fields
    }

    /**
     * 
     * @param {Number} idx - index of collection id
     */
    addNewCollection(record) {
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

        let fields

        if (idx !== 0) {
            // console.log('missing index 0 packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)

            // console.log('missing packet', 'collection id', collect_id, 'idx', idx, 'iterate', iterate)
            // console.log('new collection array of missing values', this.range(0, idx, 1))

            let missing_values = this.range(0, idx, 1)

            fields = missing_values.flatMap((value, i, arr) => {
                // console.log('add new collection missing values arr', arr)
                // let fields_array = this.createFields(record, value)
                let fields_array = []
                fields_array.push(this.createFields(record, value))
                if (arr.length > 1) {

                    fields_array.push(['\n'])

                    // remove last newline
                    if (i + 1 == arr.length) {
                        fields_array.splice(-1)
                    }
                }
                return fields_array
            })
            // console.log('add new collection fields array', fields)


            // console.log('existing collection updated', JSON.stringify(this.packet.nodes, null, 2))

        }

        this.packet.nodes[node_id].collections[collect_id] = {
            idx: idx,
            collections_sent: 1,
            percent_success: (1 / 50) * 100,
            data_type,
            recorded_at,
        }

        // check if previous collection did not get last beep
        let index = Object.keys(this.packet.nodes[node_id].collections).findIndex((el) => Number(el) == collect_id)

        // if v3 node is missing last beep
        if (node_id.length == 8 && Object.values(this.packet.nodes[node_id].collections)[index - 1].idx !== 49) {

            let prev_collect = Object.keys(this.packet.nodes[node_id].collections)[index - 1]
            let prev_idx = this.packet.nodes[node_id].collections[prev_collect].idx
            let prev_recordat = Object.values(this.packet.nodes[node_id].collections)[index - 1].recorded_at

            // console.log('v3 node array of missing values', this.range(prev_idx + 1, 50, 1))

            let missing_values = this.range(prev_idx + 1, 50, 1)

            fields = missing_values.flatMap((value, i, arr) => {
                // fields = this.createFields(record, value)
                let fields_array = []

                let fields_elem = [
                    node_id,
                    Object.values(this.packet.nodes[node_id].collections)[index - 1].data_type,
                    prev_recordat,
                    prev_collect,
                    value,
                    rssi, //rssi
                    protocol, // protocol
                    // '\n'
                ]
                fields_array.push(fields_elem)
                // console.log('v3 fields array', fields_array)
                if (arr.length > 1) {

                    fields_array.push(['\n'])

                    // remove last newline
                    if (i + 1 == arr.length) {
                        fields_array.splice(-1)
                    }
                }
                return fields_array
                // return fields_elem
            })

        }

        // if v2 node is missing last beep
        if (node_id.length < 8 && Object.values(this.packet.nodes[node_id].collections)[index - 1].idx !== 50) {


            let prev_collect = Object.keys(this.packet.nodes[node_id].collections)[index - 1]
            let prev_idx = Object.values(this.packet.nodes[node_id].collections)[index - 1].idx
            let prev_recordat = Object.values(this.packet.nodes[node_id].collections)[index - 1].recorded_at

            // console.log('v2 node array of missing values', this.range(prev_idx + 1, 51, 1))

            let missing_values = this.range(prev_idx + 1, 51, 1)

            fields = missing_values.flatMap((value, i, arr) => {
                // fields = this.createFields(record, value)
                let fields_array = []
                let fields_elem = [
                    node_id, // node_id
                    Object.values(this.packet.nodes[node_id].collections)[index - 1].data_type, // node_type, blue or coded_id
                    prev_recordat, // recorded at
                    prev_collect,
                    value, // beep
                    rssi, //rssi
                    protocol, // protocol
                    // '\n'
                ]
                // console.log('v2 fields array', fields_array)
                fields_array.push(fields_elem)
                if (arr.length > 1) {

                    fields_array.push(['\n'])

                    // remove last newline
                    if (i + 1 == arr.length) {
                        fields_array.splice(-1)
                    }
                }
                return fields_array
                // return fields_elem
            })
        }

        if (fields) {
            // console.log('new collection fields', fields)
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
            // '\n'
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

}

export { NodeMetaManager }
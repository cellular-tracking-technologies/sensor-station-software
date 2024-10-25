import moment from 'moment'
import MessageTypes from '../../../hardware/ctt/messages.js'

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
        // this.nodes = new Map()
        this.nodes = {}
    }

    /**
     * @param {Object} record - Node meta data
     */
    addNode(record) {
        const {
            protocol,
            meta: {
                data_type,
                source: { id: node_id },
                collection: { id: collect_id, idx },
            },
            channel,
            received_at
        } = record

        const node_type = data_type == MessageTypes.NodeData ? 1 : 2


        const recorded_at = moment(new Date(received_at * 1000)).utc().format(this.date_format)

        let fields

        // if node is present in object
        if (this.nodes[node_id]) {
            if (this.nodes[node_id].get('collect_id') === collect_id) {

                let iterate = this.nodes[node_id].get('idx')
                console.log('iterate', iterate)

                if (iterate + 1 !== idx) {
                    console.log('missing index', this.nodes[node_id].get('idx'), idx)

                    let missing = this.getMinMax(iterate + 1, idx)
                    let min = missing.min
                    let max = missing.max
                    let num_missing = (max - min) + 1

                    this.nodes[node_id].set('missing', num_missing)

                    fields = [
                        node_id,
                        node_type,
                        this.nodes[node_id].get('start_date'),
                        this.nodes[node_id].get('end_date'),
                        protocol,
                        collect_id,
                        this.nodes[node_id].get('missing')
                    ]
                }
                this.nodes[node_id].set('idx', idx).set('end_date', recorded_at)

            } else {
                this.nodes[node_id].set('collect_id', collect_id).set('idx', idx).set('end_date', recorded_at)
            }

            this.nodes[node_id].set('idx', idx)
            // this.nodes[node_id].set(collect_id, {
            //     idx,
            //     start_date: recorded_at,
            //     end_date: recorded_at,
            //     protocol,
            //     missing: 0,
            //     data_type,
            //     channel
            // })

            // fields = this.updateCollection(record)
            // this.nodes.set()
            // console.log('this nodes has node', this.nodes[node_id])

        } else {
            this.nodes[node_id] = new Map()
            this.nodes[node_id].set('collect_id', collect_id).set('idx', idx).set('start_date', recorded_at).set('end_date', recorded_at).set('missing', 0)

            // console.log('this nodes', this.nodes[node_id])
            // this.addNewCollection(record)
        }
        // if (Object.keys(this.packet.nodes).includes(node_id)) {
        //     fields = this.updateCollection(record)

        // } else {
        //     // add new node object if not present
        //     let collections = { collections: {} }
        //     this.packet.nodes[node_id] = collections
        //     this.addNewCollection(record)
        // }

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
            meta: {
                source: { id: node_id },
                collection: { id: collect_id, idx },
            },
            received_at,
            channel,
        } = record

        const recorded_at = moment(new Date(received_at * 1000)).utc().format(this.date_format)
        let fields, min, max, num_missing

        console.log('this node has collection', this.nodes.has(node_id))

        // if (Object.keys(this.packet.nodes[node_id].collections).includes(collect_id.toString())) {
        // if (this.packet.nodes[node_id].collections[collect_id].channel == channel) {
        // get previous index from collection
        // let iterate = this.packet.nodes[node_id].collections[collect_id].idx
        let iterate = this.nodes.values()
        console.log('iterate', iterate.idx)

        // check if index is sequential, and if idx is greater than the iterate (nodes are sending previous received beeps???)
        if (idx !== iterate + 1 && idx > iterate + 1) {
            console.log('node id', node_id, 'collect id', collect_id, 'idx should be', iterate + 1, 'but it is', idx)

            let missing = this.getMinMax(iterate + 1, idx)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1

            // reset iterate to match idx
            iterate = idx - 1
        }

        this.packet.nodes[node_id].collections[collect_id].end_date = recorded_at
        this.packet.nodes[node_id].collections[collect_id].idx = idx
        this.packet.nodes[node_id].collections[collect_id].missing = num_missing ? this.packet.nodes[node_id].collections[collect_id].missing + num_missing : this.packet.nodes[node_id].collections[collect_id].missing + 0
        // console.log('this packet nodes', this.packet.nodes[node_id].collections)
        // }
        // } else {
        fields = this.addNewCollection(record)
        // }

        if (fields)
            return fields
    }

    /**
     * 
     * @param {Number} node_id 
     * @param {Number} collect_id 
     */
    clearNodePackets(node_id) {
        let length = Object.keys(this.packet.nodes[node_id]?.collections).length
        let collections_sent = this.packet.nodes[node_id].collections[collect_id].collections_sent

        if (length >= 10) {
            this.packet.nodes[node_id].collections = {}
            console.log('node', node_id, 'node collections deleted', Object.keys(this.packet.nodes[node_id]?.collections).length)
        }
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
            },
            channel,
            received_at
        } = record

        const recorded_at = moment(new Date(received_at * 1000)).utc().format(this.date_format)
        let fields, min, max, num_missing

        // check if incoming collection is missing the first beeps
        if (idx !== 0 && this.packet.nodes[node_id].collections[collect_id]?.channel === channel) {
            // console.log('no starting idx array of missing values', this.range(0, idx, 1), collect_id)

            // create a range of missing values, from 0 to whatever the idx is
            let missing = this.getMinMax(0, idx)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
            // console.log('add new collection missing values', node_id, collect_id, missing)
        }

        this.packet.nodes[node_id].collections[collect_id] = {
            idx: idx,
            start_date: recorded_at,
            end_date: recorded_at,
            protocol,
            missing: num_missing ? num_missing : 0,
            data_type,
            channel,
        }

        let index = Object.keys(this.packet.nodes[node_id].collections).findIndex((el) => el == collect_id)
        console.log('add new collection index', index)

        if (index > 0) {
            this.checkPreviousCollection(node_id, index)

            const { prev_obj, prev_collect, prev_idx } = this.getPreviousCollection(node_id, index)

            // node type: 1 = node_coded_id, 2 = node_blue
            const node_type = prev_obj.data_type == MessageTypes.NodeData ? 1 : 2

            if (prev_obj && prev_obj.missing > 0) {
                fields = [
                    node_id,
                    node_type,
                    prev_obj.start_date,
                    prev_obj.end_date,
                    protocol,
                    Number(prev_collect),
                    Number(prev_idx),
                    prev_obj.missing,
                ]

                console.log('add new collection fields', fields)
                return fields
            }
            // clear packet.nodes object of previous data after collection id restarts
            this.clearNodePackets(record.meta.source.id)
        }
    }

    /**
     * 
     * @param {Number} index 
     */
    checkPreviousCollection(node_id, index) {

        // console.log('previous object', Object.values(this.packet.nodes[node_id].collections)[index - 1], Object.keys(this.packet.nodes[node_id].collections)[index - 1])
        let min, max, num_missing

        // if v3 node is missing last beep
        if (node_id.length == 8
            && Object.values(this.packet.nodes[node_id].collections)[index - 1]?.idx !== 49) {

            const { prev_collect, prev_idx, } = this.getPreviousCollection(node_id, index)
            console.log('v3 missing values previous collect', prev_collect, prev_idx)
            let missing = this.getMinMax(prev_idx + 1, 50, 1)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
            console.log('v3 missing values', this.packet.nodes[node_id].collections[prev_collect].missing)

            this.packet.nodes[node_id].collections[prev_collect].missing += num_missing
            console.log('v3 missing records', this.packet.nodes[node_id].collections[prev_collect])

        }

        // if v2 node is missing last beep
        if (node_id.length < 8 && Object.values(this.packet.nodes[node_id].collections)[index - 1].idx !== 50) {

            const { prev_collect, prev_idx, } = this.getPreviousCollection(node_id, index)
            // console.log('v2 node array of missing values', this.range(prev_idx + 1, 51, 1))
            console.log('v2 missing values previous collect', prev_collect, prev_idx)

            let missing = this.getMissingValues(prev_idx + 1, 51)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
            console.log('v2 missing values', this.packet.nodes[node_id].collections[prev_collect].missing)

            this.packet.nodes[node_id].collections[prev_collect].missing += num_missing
            console.log('v2 missing records', this.packet.nodes[node_id].collections[prev_collect])

        }
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

    /**
     * 
     * @param {Number} start 
     * @param {Number} stop 
     * @returns {Object} min, max
     */
    getMinMax(start, stop) {
        let missing_values = this.range(start, stop, 1)
        let min = Math.min(...missing_values)
        let max = Math.max(...missing_values)
        return { min, max }
    }

    /**
     * 
     * @param {Number} node_id 
     * @param {Number} index 
     * @returns {Object} prev_obj, prev_collect, prev_idx,
     */
    getPreviousCollection(node_id, index) {
        const prev_obj = Object.values(this.packet.nodes[node_id].collections)[index - 1]
        const prev_collect = Object.keys(this.packet.nodes[node_id].collections)[index - 1]
        const prev_idx = Object.values(this.packet.nodes[node_id].collections)[index - 1]?.idx

        return { prev_obj, prev_collect, prev_idx, }
    }

}

export { NodeMetaManager }
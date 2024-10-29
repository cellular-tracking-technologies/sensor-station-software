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
        this.nodes = {}
    }

    /**
     * @param {Object} record - Node meta data
     */
    addNode(record) {
        const { meta: { source: { id: node_id } } } = record

        let fields

        // if node is present in object
        if (Object.keys(this.nodes).includes(node_id)) {
            fields = this.updateCollection(record)

        } else {
            // add new node object if not present
            this.nodes[node_id] = new Map()
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

        let collect_obj = {
            idx: idx,
            start_date: recorded_at,
            end_date: recorded_at,
            protocol,
            missing: num_missing ? num_missing : 0,
            data_type,
            channel,
        }

        this.nodes[node_id].set(collect_id, collect_obj)

        // check if incoming collection is missing the first beeps
        if (idx !== 0 && this.nodes[node_id].get(collect_id).channel === channel) {
            // console.log('no starting idx array of missing values', this.range(0, idx, 1), collect_id)

            // create a range of missing values, from 0 to whatever the idx is
            let missing = this.getMinMax(0, idx)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
            // console.log('add new collection missing values', node_id, collect_id, missing)
        }

        let index = [...this.nodes[node_id].keys()].findIndex((el) => el == collect_id)
        console.log('add new collection index', index)

        if (index > 0) {
            this.checkPreviousCollection(node_id, index)

            const { prev_obj, prev_collect, } = this.getPreviousCollection(node_id, index)
            const node_type = prev_obj.data_type == MessageTypes.NodeData ? 1 : 2

            if (prev_obj && prev_obj.missing > 0) {
                fields = [
                    node_id,
                    node_type,
                    prev_obj.start_date,
                    prev_obj.end_date,
                    protocol,
                    Number(prev_collect),
                    prev_obj.missing,
                ]

                console.log('add new collection fields', fields)
                return fields
            }
            // clear packet.nodes object of previous data after collection id restarts
            let length = [...this.nodes[node_id].keys()].length
            if (length > 10)
                this.clearNodePackets(node_id)
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
        let fields, min, max
        let num_missing = 0

        if ([...this.nodes[node_id].keys()].includes(collect_id)) {
            if (this.nodes[node_id].get(collect_id).channel == channel) {
                let iterate = this.nodes[node_id].get(collect_id).idx

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

                this.nodes[node_id].get(collect_id).end_date = recorded_at
                this.nodes[node_id].get(collect_id).idx = idx
                this.nodes[node_id].get(collect_id).missing += num_missing

                console.log('this packet nodes', this.nodes[node_id].keys(), collect_id)

            }
        } else {
            fields = this.addNewCollection(record)
        }

        if (fields)
            return fields
    }


    /**
     * 
     * @param {Number} node_id 
     * @param {Number} collect_id 
     */
    clearNodePackets(node_id) {

        this.nodes[node_id].clear()
        console.log('node', node_id, 'node collections deleted', [...this.nodes[node_id].keys()].length)
    }

    /**
     * 
     * @param {Number} index 
     */
    checkPreviousCollection(node_id, index) {

        console.log('previous index', [...this.nodes[node_id].values()][index - 1].idx)
        // console.log('previous object', Object.values(this.nodes[node_id].collections)[index - 1], Object.keys(this.nodes[node_id].collections)[index - 1])
        let min, max, num_missing

        // if v3 node is missing last beep
        if (node_id.length == 8 && [...this.nodes[node_id].values()][index - 1].idx !== 49) {
            // && Object.values(this.nodes[node_id].collections)[index - 1]?.idx !== 49) {

            const { prev_obj, prev_collect, prev_idx, } = this.getPreviousCollection(node_id, index)
            console.log('v3 missing values previous collect', prev_obj, prev_collect, prev_idx)
            let missing = this.getMinMax(prev_idx + 1, 50, 1)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
            console.log('v3 missing values', num_missing)

            // [...this.nodes[node_id].values()]

            prev_obj.missing += num_missing
            // console.log('v3 missing records', prev_obj)

        }

        // if v2 node is missing last beep
        if (node_id.length < 8 && [...this.nodes[node_id].values()][index - 1].idx !== 50) {

            const { prev_obj, prev_collect, prev_idx, } = this.getPreviousCollection(node_id, index)
            // console.log('v2 node array of missing values', this.range(prev_idx + 1, 51, 1))
            console.log('v2 missing values previous collect', prev_obj, prev_collect, prev_idx)

            let missing = this.getMissingValues(prev_idx + 1, 51)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
            console.log('v2 missing values', prev_obj.missing)

            prev_obj.missing += num_missing
            console.log('v2 missing records', prev_obj)

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
        const prev_obj = [...this.nodes[node_id].values()][index - 1]
        const prev_collect = [...this.nodes[node_id].keys()][index - 1]
        const prev_idx = [...this.nodes[node_id].keys()][index - 1]?.idx

        return { prev_obj, prev_collect, prev_idx, }
    }

}

export { NodeMetaManager }
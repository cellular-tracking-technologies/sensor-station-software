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
        this.nodes = new Map()
    }

    /**
     * @param {Object} record - Node meta data
     */
    addNode(record) {
        const { meta: { source: { id: node_id } } } = record
        let fields

        // if node is present in object
        if (this.nodes.keys().next().value == node_id) {
            fields = this.updateCollection(record)

        } else {
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

        const {
            protocol,
            meta: {
                data_type,
                source: { id: node_id },
                collection: { id: collect_id, collect, idx },
            },
            channel,
            received_at
        } = record

        const recorded_at = moment(new Date(received_at)).utc().format(this.date_format)
        let fields, min, max, num_missing

        const previous_collection = this.nodes.get(node_id)
        // console.log('previous collection', previous_collection)

        if (previous_collection && previous_collection.missing > 0) {
            fields = [
                node_id,
                previous_collection.node_type,
                previous_collection.start_date,
                previous_collection.end_date,
                previous_collection.protocol,
                Number(previous_collection.collect_id),
                previous_collection.idx,
                previous_collection.missing,
            ]
        }

        const node_type = data_type == MessageTypes.NodeData ? 1 : 2

        let collect_obj = {
            node_type,
            collect_id,
            idx,
            start_date: recorded_at,
            end_date: recorded_at,
            protocol,
            missing: 0,
            data_type,
            channel,
        }

        this.nodes.set(node_id, collect_obj)

        // check if incoming collection is missing the first beeps
        if (idx !== 0 && this.nodes.get(node_id).channel == channel) {

            // create a range of missing values, from 0 to whatever the idx is
            let missing = this.getMinMax(0, idx)
            min = missing.min
            max = missing.max
            num_missing = (max - min) + 1
        }

        if (fields) {
            console.log('add new collection fields', fields)
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

        const recorded_at = moment(new Date(received_at)).utc().format(this.date_format)
        let fields, min, max
        let num_missing = 0

        // console.log('update collection nodes', this.nodes)

        if (this.nodes.get(node_id).collect_id === collect_id) {
            if (this.nodes.get(node_id).channel == channel) {
                let iterate = this.nodes.get(node_id).idx

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

                this.nodes.get(node_id).end_date = recorded_at
                this.nodes.get(node_id).idx = idx
                this.nodes.get(node_id).missing += num_missing
            }
        } else {
            fields = this.addNewCollection(record)
        }

        if (fields)
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

}

export { NodeMetaManager }
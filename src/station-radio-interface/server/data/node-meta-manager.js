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
        this.stats = new Map()
        this.total_records = 0
        this.missing_records = 0
    }

    /**
     * @param {Object} record - Node meta data
     */
    addNode(record) {
        const { meta: { source: { id: node_id } } } = record
        let fields

        if ([...this.nodes.keys()].includes(node_id.toString())) {
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
                collection: { id: collect_id, idx },
            },
            channel,
            received_at
        } = record

        const recorded_at = moment(new Date(received_at)).utc().format(this.date_format)
        let fields, min, max, num_missing
        const node_type = data_type == MessageTypes.NodeData ? 1 : 2

        const previous_collection = this.nodes.get(node_id)
        let expected_records

        if (previous_collection) {
            expected_records = this.stats.get(node_id) ? this.stats.get(node_id).expected_records + previous_collection.idx : 0 + previous_collection.idx

            if (node_id.length === 8) {
                expected_records += 1
            }

            const missing_records = this.stats.get(node_id) ? this.stats.get(node_id).missing_records + previous_collection.missing : 0 + previous_collection.missing
            const total_records = expected_records - missing_records
            const percent_success = Math.floor((total_records / expected_records) * 100)
            // const percent_success = (total_records / expected_records)


            this.stats.set(node_id, { expected_records, missing_records, total_records, percent_success })
            console.log('this stats', this.stats)

        }

        if (previous_collection?.missing > 0) {
            fields = [
                node_id,
                previous_collection.node_type,
                previous_collection.start_date,
                previous_collection.end_date,
                previous_collection.protocol,
                Number(previous_collection.collect_id),
                previous_collection.idx,
                previous_collection.missing,
                // this.stats.get(node_id).expected_records,
                this.stats.get(node_id).missing_records,
                this.stats.get(node_id).total_records,
                this.stats.get(node_id).percent_success,

            ]
        }

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
            return fields
        }
    }

    /**
     * 
     * @param {Number} record - record
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
                // console.log('nodes missing', this.nodes.get(node_id).missing)
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
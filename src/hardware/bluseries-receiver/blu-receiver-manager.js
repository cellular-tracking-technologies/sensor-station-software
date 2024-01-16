import Leds from '../../hardware/bluseries-receiver/driver/leds.js'
import { BluReceiver, BluReceiverTask } from '../../hardware/bluseries-receiver/blu-receiver.js'
import fs from 'fs'
import moment from 'moment'

class BluReceiverManager extends BluReceiver {
    constructor(opts) {
        super({
            path: opts.path,
        })
        this.beeps
        this.dropped
    }

    /**
 * 
 * @param {Number} radio_channel 
 */
    async getBluVersion(radio_channel) {
        try {
            return this.schedule({
                task: BluReceiverTask.VERSION,
                radio_channel: radio_channel,
            })
        } catch (e) {
            console.error('GET BLU VERSION ERROR', e)
        }
    }

    /**
     * 
     * @param {Number} radio_channel Blu Radio Channel
     * @param {Number} buffer_interval Time in milliseconds between ring buffer is cleared of tags
     * @returns BLE tag detections
     */
    async getDetections(radio_channel, buffer_interval) {
        console.log('blu get detections radio channel', radio_channel)
        try {
            // added this so radio polls immediately on startup
            this.schedule({
                task: BluReceiverTask.DETECTIONS,
                radio_channel,
            })
            setInterval(() => {
                this.beeps = this.schedule({
                    task: BluReceiverTask.DETECTIONS,
                    radio_channel,
                })
            }, buffer_interval)
            // this.getDroppedDetections(radio_channel, buffer_interval)
            return this.beeps
        } catch (e) {
            console.log('getDetections error', e)
        }
    }

    /**
   * 
   * @param {Number} radio_channel Radio Channel
   * @param {Number} led_state Led State {Blink|On|Off}
   * @param {Number} blink_rate Blink per ms
   * @param {Number} blink_count Number of blinks before turning off
   */
    async setLogoFlash(radio_channel, opts) {

        return this.schedule({
            task: BluReceiverTask.LEDS,
            radio_channel: radio_channel,
            data: {
                led_channel: Leds.type.logo,
                state: opts.led_state,
                blink_rate_ms: opts.blink_rate,
                blink_count: opts.blink_count,
            }
        })
        // }, timeout ? timeout : 0)
    }

    /**
     * 
     * @param {Number} radio_channel 
     * @param {String} firmware_file
     */
    async setBluDfu(radio_channel, firmware_file) {
        // console.log('update firmware', firmware_file)
        try {

            // await this.blu_receiver.getBluVersion(radio_object.radio)
            // await this.blu_receiver.stopDetections(radio_object)
            // await this.blu_receiver.setLogoFlash(Number(radio_object.radio), { led_state: 2, blink_rate: 100, blink_count: -1, })
            this.schedule({
                task: BluReceiverTask.DFU,
                radio_channel,
                data: {
                    file: fs.readFileSync(firmware_file),
                }
            })
            // await this.blu_receiver.rebootBluReceiver(radio_object, poll_interval)
            // setTimeout(() => {
            //     this.schedule({
            //         task: BluReceiverTask.VERSION,
            //         radio_channel: radio_object.radio,
            //     })
            // }, 20000)
        } catch (e) {
            console.error('Update firmware error', e)
        }
    }

    /**
     * 
     * @param {Number} radio_channel Radio channel number 
     */
    async rebootBluRadio(radio_channel) {
        try {

            console.log('reboot blu receiver radio object', radio_channel)
            // await this.setLogoFlash(radio_object.radio, { led_state: 2, blink_rate: 100, blink_count: 10 })
            // await this.blu_receiver.stopDetections(radio_object)
            return await this.schedule({
                task: BluReceiverTask.REBOOT,
                radio_channel,
            })
        } catch (e) {
            console.error('Reboot Blu Radio Error', e)
        }

        // await this.getDetections(radio_object.radio, poll_interval)
        // restart radio with poll interval of 10s
    }

    /**
     * 
     * @param {Number} radio_channel Radio Channel
     * @param {Object} opts
     * @param {Boolean} opts.scan Radio scanning for tags
     * @param {Boolean} opts.rx_blink Sets radio LED to blink if tag is detected
     * @returns 
     */
    async setBluConfig(radio_channel, opts) {
        console.log('set blu config radio channel', radio_channel)
        const { scan, rx_blink } = opts
        return this.schedule({
            task: BluReceiverTask.CONFIG,
            radio_channel,
            data: {
                scan,
                rx_blink,
            },
            status: {
                scan,
                rx_blink,
            }
        })
    }

    /**
 * 
 * @param {Number} radio_channel 
 * @returns Dropped Detections
 */
    async getBluStats(radio_channel, buffer_interval) {
        this.schedule({
            task: BluReceiverTask.STATS,
            radio_channel,
        })
        this.dropped = setInterval(() => {
            this.blu_receiver.schedule({
                task: BluReceiverTask.STATS,
                radio_channel,
            })
        }, buffer_interval)
        return this.dropped
    }
    /**End of Blu Receiver Functions, New functions generated below */

    /**
     * @param {Object} radio_object Radio Object that contains radio channel number and poll interval in ms
     */
    async stopDetections(radio_object) {
        console.log('stop detections radio object', radio_object)
        let { radio: { radio: radio_channel, poll_interval } } = radio_object
        console.log('stop detections radio', radio_object)
        // const key = radio_channel.toString()
        // let radio_index = this.blu_receivers.blu_radios.findIndex(radio => radio.radio == radio_channel)
        this.setBluConfig(radio_channel, { scan: 0, rx_blink: 0, })
        this.setLogoFlash(radio_channel, { led_state: 0, blink_rate: 0, blink_count: 0, })
        // console.log('stop detections radio', radio)
        clearInterval(radio_object.beeps)
        clearInterval(radio_object.dropped)
    }

    /**
     * 
     * @param {Number} milliseconds 
     * @returns Promise
     */
    delay(milliseconds) {
        return new Promise(resolve => {
            setTimeout(resolve, milliseconds);
        });
    }

    async startUpFlashLogo() {

        let blu_leds = [1, 2, 3, 4]
        const logo_start = await Promise.all(blu_leds.map((led) => {
            this.delay(1000)
            this.setLogoFlash(led, { led_state: 1, blink_rate: null, blink_count: null, })
        })).then((value) => {
            console.log('logo led is turning on', value)
        }).catch((e) => {
            console.error(e)
        })

        const logo_flash = await Promise.all(blu_leds.map((led) => {
            this.setLogoFlash(led, { led_state: 2, blink_rate: 500, blink_count: 6, })
        })).then((value) => {
            console.log('logo leds are flashing', value)
        }).catch((e) => {
            console.error(e)
        })
    }

    /**
    //  *  @param {Number} radio_channel // Radio Channel to turn on
     *  @param {Object} radio_object
     *  @param {Number} poll_interval // Time in ms between emptying ring buffer
     */
    async radioOn(radio_object, poll_interval) {
        console.log('blu radio on radio object', radio_object)
        let radio_channel = radio_object.radio
        console.log('blu radio on radio', radio_channel)
        await this.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
        await this.getBluVersion(radio_channel)
        await this.getDetections(radio_channel, poll_interval)
        // await this.getDetections(radio, poll_interval)
    }

    /**
     * 
     * @object {Object} radio_object Radio Channel to turn off 
     */
    async radioOff(radio_object) {
        console.log('blu radio off', radio_object)
        await this.stopDetections(radio_object)
        // let key = radio_channel.toString()
        // clearInterval(this.blu_radios[key]) // changes timers _destroyed key to true
        // let radio_index = this.blu_receivers.blu_radios.findIndex(radio => radio.radio == radio_channel)
        // clearInterval(this.blu_receivers.blu_radios[radio_index])
        clearInterval(radio_object)
    }

    async updateBluFirmware(radio_object, firmware_file) {
        console.log('update blu firmware', radio_object)
        let { radio: radio_channel, poll_interval } = radio_object
        try {
            await this.getBluVersion(radio_channel)
            await this.stopDetections(radio_object)
            await this.setLogoFlash(Number(radio_channel), { led_state: 2, blink_rate: 100, blink_count: -1, })
            await this.setBluDfu(radio_channel, firmware_file)
            // this.schedule({
            //     task: BluReceiverTask.DFU,
            //     radio_channel: radio_object.radio,
            //     port: station_port,
            //     data: {
            //         file: fs.readFileSync(firmware_file),
            //     }
            // })
            await this.rebootBluRadio(radio_channel)
            setTimeout(() => {
                // this.schedule({
                //     task: BluReceiverTask.VERSION,
                //     radio_channel: radio_object.radio,
                // })
            }, 20000)
            await this.getBluVersion(radio_channel)
        } catch (e) {
            console.error('Update firmware error', e)
        }
    }

    async updateConfig(blustation, blu_radio, poll_interval) {
        let station_config = JSON.parse(fs.readFileSync('/etc/ctt/station-config.json'))
        console.log('update config station config', station_config)
        let receiver_index = station_config.blu_receivers.findIndex(receiver => receiver.channel == blustation.port)
        console.log('receiver index', station_config.blu_receivers[receiver_index])
        let radio_index = station_config.blu_receivers[receiver_index].blu_radios.findIndex(radio => radio.radio == blu_radio.radio)
        // console.log('radio index', station_config.blu_receivers[receiver_index].blu_radios[radio_index])
        station_config.blu_receivers[receiver_index].blu_radios[radio_index].poll_interval = poll_interval

        fs.writeFileSync('/etc/ctt/station-config.json',
            JSON.stringify(station_config, null, 2),
            { encoding: 'utf8', flag: 'w', },
            err => {
                if (err) throw err;
                console.log('blu radio map file updated')
            })
    }

    destroy(radio) {
        clearInterval(radio.polling)
        clearInterval(radio.dropped)
        radio.polling.destroyed = true
        radio.dropped.destroyed = true
    }

    destroy_receiver() {

        delete this.polling
        delete this.dropped
        delete this.firmware
        delete this.blu_fw
        delete this.blu_channels
        delete this.blu_radios
        delete this.blu_receivers
        delete this.data_manager
        delete this.broadcast
        delete this.sensor_socket_server
        this.destroyed_port = this.port
        delete this.port
        delete this.path
        delete this.beeps
        // delete this
    }


}

export default BluReceiverManager
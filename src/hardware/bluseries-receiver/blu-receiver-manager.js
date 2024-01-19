import Leds from '../../hardware/bluseries-receiver/driver/leds.js'
import { BluReceiver, BluReceiverTask } from '../../hardware/bluseries-receiver/blu-receiver.js'
import fs from 'fs'
import moment from 'moment'

class BluReceiverManager extends BluReceiver {
    constructor(opts) {
        super({
            path: opts.path,
        })
        this.path = opts.path,
            this.port = opts.port
        this.blu_radios = opts.blu_radios
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
            // getBluVersion(radio_channel)
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
            // this.schedule({
            //     task: BluReceiverTask.DETECTIONS,
            //     radio_channel,
            // })
            let beeps = setInterval(() => {
                this.schedule({
                    task: BluReceiverTask.DETECTIONS,
                    radio_channel,
                })
            }, buffer_interval)
            return beeps
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
            this.schedule({
                task: BluReceiverTask.DFU,
                radio_channel,
                data: {
                    file: fs.readFileSync(firmware_file),
                }
            })

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
            return this.schedule({
                task: BluReceiverTask.REBOOT,
                radio_channel,
            })
        } catch (e) {
            console.error('Reboot Blu Radio Error', e)
        }
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
        // console.log('set blu config radio channel', radio_channel)
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
        try {
            let dropped
            // this.schedule({
            //     task: BluReceiverTask.STATS,
            //     radio_channel,
            // })
            dropped = setInterval(() => {
                this.schedule({
                    task: BluReceiverTask.STATS,
                    radio_channel,
                })
            }, buffer_interval)
            return dropped
        } catch (e) {
            console.error('could not get dropped detections')
        }
    }
    /**End of Blu Receiver Functions, New functions generated below */

    /**
     * @param {Object} radio_object Radio Object that contains radio channel number and poll interval in ms
     */
    async stopDetections(radio_object) {

        await this.setBluConfig(radio_object.radio, { scan: 0, rx_blink: 0, })
        clearInterval(await radio_object.beeps)

        clearInterval(await radio_object.dropped)
        console.log('stop detections droppeed after clear interval', radio_object.dropped)

        delete await radio_object.beeps
        delete await radio_object.dropped
        return radio_object

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
        let radio_channel = radio_object.radio
        await this.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
        await this.getBluVersion(radio_channel)
        let beeps = await this.getDetections(radio_channel, poll_interval)
        let dropped = await this.getBluStats(radio_channel, poll_interval)
        return { beeps, dropped }
    }

    /**
     * 
     * @object {Object} radio_object Radio Channel to turn off 
     */
    async radioOff(radio_object) {
        // console.log('blu radio off', radio_object)
        let radio_off = await this.stopDetections(radio_object)
        // console.log('blu radio off', radio_off)
        return radio_off
    }

    async updateBluFirmware(radio_object, firmware_file) {
        console.log('update blu firmware', radio_object)
        let { radio: radio_channel, poll_interval } = radio_object
        try {
            await this.getBluVersion(radio_channel)
            await this.stopDetections(radio_object)
            await this.setLogoFlash(Number(radio_channel), { led_state: 2, blink_rate: 100, blink_count: -1, })
            await this.setBluDfu(radio_channel, firmware_file)
            await this.rebootBluRadio(radio_channel)
            setTimeout(() => {
                // this.schedule({
                //     task: BluReceiverTask.VERSION,
                //     radio_channel: radio_object.radio,
                // })
            }, 20000)
            await this.getBluVersion(radio_channel)
            await this.radioOn(radio_object, radio_object.poll_interval)
        } catch (e) {
            console.error('Update firmware error', e)
        }
    }
    /**
     * 
     * @param {Class} blu_receiver Blu receiver class
     * @param {Number} blu_radio Radio number that has radio channel number and poll interval
     * @param {Number} poll_interval Polling interval in ms
     */
    async updateConfig(blu_receiver, blu_radio, poll_interval) {
        let station_config = JSON.parse(fs.readFileSync('/etc/ctt/station-config.json'))
        let receiver_index = station_config.blu_receivers.findIndex(receiver => receiver.channel == blu_receiver.port)

        let radio_index = station_config.blu_receivers[receiver_index].blu_radios.findIndex(radio => radio.radio == blu_radio)
        station_config.blu_receivers[receiver_index].blu_radios[radio_index].poll_interval = poll_interval

        fs.writeFileSync('/etc/ctt/station-config.json',
            JSON.stringify(station_config, null, 2),
            { encoding: 'utf8', flag: 'w', },
            err => {
                if (err) throw err;
                console.log('blu radio map file updated')
            })
    }

    async destroy_radio(radio) {
        try {

            clearInterval(radio.beeps)
            clearInterval(radio.dropped)
            radio.beeps.destroyed = true
            radio.dropped.destroyed = true
        } catch (e) {
            console.error(e)
        }
    }
}

export default BluReceiverManager
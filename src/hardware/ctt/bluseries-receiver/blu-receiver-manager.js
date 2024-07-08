import Leds from './driver/leds.js'
import { BluReceiver, BluReceiverTask } from './blu-receiver.js'
import BluFirmwareUpdater from './blu-firmware-updater.js'
import fs from 'fs'

class BluReceiverManager extends BluReceiver {
    constructor(opts) {
        super({
            path: opts.path,
        })
        this.path = opts.path
        this.port = opts.port
        this.blu_radios = opts.blu_radios
        this.blu_updater = new BluFirmwareUpdater({})
    }

    /**
 * 
 * @param {Number} radio_channel 
 */
    async getBluVersion(radio_channel) {
        let blu_version
        try {
            blu_version = await this.schedule({
                task: BluReceiverTask.VERSION,
                radio_channel: radio_channel,
            })

            return blu_version
        } catch (e) {
            console.error('GET BLU VERSION ERROR', e)
            clearInterval(blu_version)
            blu_version = await getBluVersion(radio_channel)
        }
    }

    /**
     * 
     * @param {Number} radio_channel Blu Radio Channel
     * @param {Number} buffer_interval Time in milliseconds between ring buffer is cleared of tags
     * @returns beeps timeout object
     */
    async getDetections(radio_channel, buffer_interval) {
        let poll_interval = buffer_interval ? buffer_interval : 10000
        try {
            this.schedule({
                task: BluReceiverTask.DETECTIONS,
                radio_channel,
            })
            let beeps = setInterval(() => {
                this.schedule({
                    task: BluReceiverTask.DETECTIONS,
                    radio_channel,
                })
            }, poll_interval)
            return beeps
        } catch (e) {
            console.log('getDetections error', e)
            clearInterval(beeps)
            beeps = undefined
            await this.getDetections(radio_channel, buffer_interval)
        }
    }

    /**
   * 
   * @param {Number} radio_channel Radio Channel
   * @param {Number} opts.led_state Led State {Blink|On|Off}
   * @param {Number} opts.blink_rate Blink per ms
   * @param {Number} opts.blink_count Number of blinks before turning off
   */
    async setBluLed(radio_channel, opts) {


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
    }

    /**
     * 
     * @param {Number} radio_channel Radio channel on bluseries receiver
     * @param {String} firmware_file filepath of blu firmware.bin file
     */
    async setBluDfu(radio_channel, firmware_file) {
        console.log('set blu dfu firmware', firmware_file)
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
     * @param {Number} radio_channel Radio channel number on bluseries receiver
     */
    async rebootBluRadio(radio_channel) {
        try {
            return await this.schedule({
                task: BluReceiverTask.REBOOT,
                radio_channel,
            })
        } catch (e) {
            console.error('Reboot Blu Radio Error', e)
            try {

                for (i = 1; i < 3; i++) {
                    return await this.schedule({
                        task: BluReceiverTask.REBOOT,
                        radio_channel,
                    })
                }
            } catch (e) {
                console.error('Something is wrong with receiver, trying plugging it into a different usb port')
            }
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
        const { scan, rx_blink } = opts
        try {
            console.log('turning blu radio', radio_channel, opts.scan)
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
        } catch (e) {
            console.error('error in setting blu configuration', e)
            while (e) {
                return await this.setBluConfig(radio_channel, opts)
            }
        }
    }
    /**
 * 
 * @param {Number} radio_channel Radio channel number
 * @param {Number} buffer_interval Poll interval number in ms
 * @returns Dropped Detections
 */
    async getBluStats(radio_channel, buffer_interval) {
        let poll_interval = buffer_interval ? buffer_interval : 10000
        try {
            this.schedule({
                task: BluReceiverTask.STATS,
                radio_channel,
            })
            let dropped = setInterval(() => {
                this.schedule({
                    task: BluReceiverTask.STATS,
                    radio_channel,
                })
            }, poll_interval)
            return dropped
        } catch (e) {
            console.error('could not get dropped detections', e)
            await getBluStats(radio_channel, buffer_interval)
        }
    }
    /**End of Blu Receiver Functions, New functions generated below */

    /**
 *  @param {Object} radio_object Blu radio object containing radio channel number, poll interval, beeps, and dropped timeout events
 *  @param {Number} radio_poll // Time in ms between emptying ring buffer
 */
    async radioOn(radio_object, radio_poll) {
        let poll_interval = radio_poll ? radio_poll : 10000
        let radio_channel = radio_object.radio
        await this.setBluConfig(radio_channel, { scan: 1, rx_blink: 1, })
        radio_object.beeps = await this.getDetections(radio_channel, poll_interval)
        radio_object.dropped = await this.getBluStats(radio_channel, poll_interval)
    }

    /**
     * @param {Object} radio_object Blu radio object containing radio channel number, poll interval, beeps, and dropped timeout events
     */
    async radioOff(radio_object) {

        await this.setBluConfig(radio_object.radio, { scan: 0, rx_blink: 0, })
        clearInterval(await radio_object.beeps)
        clearInterval(await radio_object.dropped)
        return radio_object
    }

    /**
 * @param {Object} radio_object Radio Object that contains radio channel number and poll interval in ms
 * @param {Timeout Object} radio_object.beeps timeout object that controls the bluseries receiver detections
 */
    async stopDetections(radio_object) {
        clearInterval(await radio_object.beeps)
        return radio_object.beeps
    }

    /**
 * @param {Object} radio_object Radio Object that contains radio channel number and poll interval in ms
 *  @param {Timeout Object} radio_object.dropped timeout object that controls the bluseries receiver stats
 */
    async stopStats(radio_object) {
        clearInterval(await radio_object.dropped)
        return radio_object.dropped
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

    /**
     * blinks the bluseries receiver butterfly logo on/off on initialization
     */
    async startUpFlashLogo() {

        let blu_leds = [1, 2, 3, 4]
        const logo_start = await Promise.all(blu_leds.map((led) => {
            this.delay(1000)
            this.setBluLed(led, { led_state: 1, blink_rate: null, blink_count: null, })
        })).then((value) => {
            console.log('logo led is turning on', value)
        }).catch((e) => {
            console.error(e)
        })

        const logo_flash = await Promise.all(blu_leds.map((led) => {
            this.setBluLed(led, { led_state: 2, blink_rate: 500, blink_count: 6, })
        })).then((value) => {
            console.log('logo leds are flashing', value)
        }).catch((e) => {
            console.error(e)
        })
    }

    /**
     * @param {Object} radio_object Object containing the radio channel, poll interval, beeps and dropped timeout objects
     * @param {Number} radio_channel Radio channel
     * @param {Number} poll_interval Poll interval in ms for blu radios
     */
    async updateBluFirmware(radio_object) {
        let { radio: radio_channel, poll_interval } = radio_object
        let firmware_list = this.blu_updater.readFirmwareFiles()
        let current_firmware = await this.blu_updater.getCurrentFirmware()
            .then((value) => { return value })
            .catch((e) => { console.error(e) })
        let new_firmware = await this.blu_updater.getNewFirmware()
            .then((value) => { return value })
            .catch((e) => { console.error(e) })

        try {
            if (new_firmware !== current_firmware) {
                console.log('Need to update blu firmware')
                console.log('firmware file from blu firmware updater class', new_firmware)
                await this.getBluVersion(radio_channel)
                await this.setBluLed(Number(radio_channel), { led_state: 2, blink_rate: 100, blink_count: -1, })
                await this.setBluDfu(radio_channel, new_firmware)
                await this.rebootBluRadio(radio_channel)
                setTimeout(async () => {
                    await this.getBluVersion(radio_channel)
                    await this.blu_updater.updateFirmwareFiles()
                }, 20000)

            } else {
                console.log('Current firmware is latest version')
            }


        } catch (e) {
            console.error('Update firmware error', e)
        }
    }

    async revertBluFirmware(radio_object, blu_fw) {
        let { radio: radio_channel, poll_interval } = radio_object
        let blu_version = blu_fw[radio_channel]
        console.log('blu fw channel version', blu_fw[radio_channel])
        let previous_firmware = this.blu_updater.revertFirmwareUpdate(blu_version)
        console.log('revert blu firmware previous firmware', previous_firmware)

        try {

            await this.getBluVersion(radio_channel)
            await this.setBluLed(Number(radio_channel), { led_state: 2, blink_rate: 100, blink_count: -1, })
            await this.setBluDfu(radio_channel, previous_firmware)
            await this.rebootBluRadio(radio_channel)

            setTimeout(async () => {
                await this.getBluVersion(radio_channel)
                radio_object.beeps = await this.getDetections(radio_channel, poll_interval)
                radio_object.dropped = await this.getBluStats(radio_channel, poll_interval)
                await this.blu_updater.updateFirmwareFiles()
            }, 20000)


        } catch (e) {
            console.error(e)
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
        let receiver = station_config.blu_receivers.find(receiver => receiver.channel == blu_receiver.port)
        let radio = receiver.blu_radios.find(radio => radio.radio == blu_radio)
        radio.poll_interval = poll_interval

        fs.writeFileSync('/etc/ctt/station-config.json',
            JSON.stringify(station_config, null, 2),
            { encoding: 'utf8', flag: 'w', },
            err => {
                if (err) throw err;
                console.log('blu radio map file updated')
            })
    }

    /**
     * 
     * @param {Object} radio Radio object containing radio channel, poll interval, beeps and dropped timeout events 
     */
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
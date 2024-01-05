import { 
  PollState, 
} from '../io-expander/expander.js'

import i2cScanner from '../i2c/scan.js'
import At24Mac602 from './at24mac602.js'
import Atsha204a from './atsha204a.js'
import Ds3231 from './ds3231.js'
import fs from 'fs'

// prefix for V3 station IDs
const V3_PREFIX = 'V3'

const IdChips = {
  DS3231: async() => {
    const buffer = await Ds3231()
    return V3_PREFIX.concat(buffer.slice(3).toString('hex').toUpperCase())
  },
  AT24MAC602: async(revision) => {
    const buffer = await At24Mac602.ReadEUI64()
    // for the At24MAC602 chip - slice the first 2 of 3 manufacturer bytes 
    const sliced_buffer = Buffer.concat([buffer.slice(2,3), buffer.slice(5)])
    // V3 prefix  - append V3DD where DD is the provided revision
    const prefix = V3_PREFIX.concat(revision.toString().padStart(2, '0'))
    return prefix.concat(sliced_buffer.toString('hex').toUpperCase())
  },
  ATSHA204A: async() => {
    return Atsha204a()
  }
}

/**
 * abstraction around identifying hardware version / revision
 * IO expander needs to be initialized in advanced
 */
class StationIdInterface {
  // i2c address for IO expander on v3+ boards
  #expander_address = 0x70

  /**
   * checks resister configuration to identify hardware revision for V3+ stations
   * through the IO expander
   */
  async getHardwareRevision() {
    const results = await PollState()
    // expect a, b for two channels with 8 input/outputs
    const { a: channel_a } = results
    // bitwise NOT ... javascript converts to signed 32 bit integers
    // https://stackoverflow.com/questions/6798111/bitwise-operations-on-32-bit-unsigned-ints
    return ((~channel_a >>> 0) & 0xFF) >> 1
  } 

  async ioExpanderExists() {
    // scan the i2c bus channel 1 for device addresses
    const addresses = await i2cScanner(1)
    // check if the IO expander address is populated (V3 stations)
    if (addresses.includes(this.#expander_address)) {
      // IO expander found - get the hardware revision
      return true
    }
    return false
  }

  /**
   * @typedef {Object} Version
   * @property {Number} version
   * @property {Number} revision
   */
  /**
   * 
   * @returns {Version} 
   */
  async getVersion() {
    const io_expander_exists = await this.ioExpanderExists()
    // check if the IO expander address is populated (V3 stations)
    if (io_expander_exists) {
      // IO expander found - get the hardware revision
      const revision = await this.getHardwareRevision()
      return {
        version: 3,
        revision: revision,
      }
    }
    // assume a V2 station as default hardware
    return {
      version: 2,
      revision: 0,
    }
  }

  /**
   * 
   * @param {Number} revision hardware revision to determine ID chip to check
   * @returns {String} V3+ Station ID
   */
  async getV3StationId(revision) {
    let id
    const human_revision = revision + 1
    switch(revision) {
      case 0:
        // revision 0 - use DS3231 RTC EEPROM chip for ID
      case 127:
        // revision 0 - use DS3231 RTC EEPROM chip for ID
        id = await IdChips.DS3231()
        break
      case 1:
        // revision 1 - use AT24MAC602 Serial EEPROM 
        id = await IdChips.AT24MAC602(human_revision)
        break
      default: 
        throw new Error('Cannot identify station revision')
    }
    return id
  }

  /**
   * 
   * @returns {String} V2 Station ID
   */
  async getV2StationId() {
    return IdChips.ATSHA204A()
  }

  /**
   * @typedef {Object} HardwareInfo
   * @property {String} id - Station ID
   * @property {Number} version - Station Version
   * @property {Number} revision - Station Hardware Revision
   * @returns {HardwareInfo} 
   */
  async getHardwareInfo() {
    const version_info = await this.getVersion()
    const { version, revision } = version_info
    let id
    switch(version) {
      case 3:
        id = await this.getV3StationId(revision)
        break
      case 2:
        id = await this.getV2StationId()
        break
      default:
        throw new Error(`Unexpectted station version ${version}`)
    }
    return {
      id,
      version,
      revision
    }
  }

  async getRadioMap() {
    const version_info = await this.getVersion()
    const { version, revision } = version_info
    let radio_map

    switch(version) {
      case 3:
        radio_map = fs.readFileSync('/etc/ctt/radios/v3-blu-radio-map.js', null, 2)
        break
      case 2:
        radio_map = fs.readFileSync('/etc/ctt/radios/v2-blu-radio-map.js', null, 2)
        break
      default: 
      throw new Error('No blu radio map found')
    }
  }
}

export default StationIdInterface

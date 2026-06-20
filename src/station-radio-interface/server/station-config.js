import fs from 'fs'
import default_config from './default-config.js'
import RadioMaps from './radio-maps/index.js'

class StationConfig {
  /**
 * opts.config_filepath
   */
  constructor(config_filepath) {
    this.config_filepath = config_filepath
    this.default_config = default_config
    this.data
  }

  pretty() {
    return JSON.stringify(this.data, null, 2)
  }

  async checkIfFileExists(filepath) {
    return new Promise((resolve) => {
      fs.stat(filepath, (err, stats) => {
        if (err) {
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  }

  /**
   * opts.config
   **/
  threadRadioMapsWithConfig(config) {
    const { blu_receivers } = config

    // 434 MHz radios are NO LONGER threaded by path here: ctt-radio-driver
    // assigns the channel via the socket name (/run/ctt/radios/ch<N>.sock), so
    // base-station attaches by channel directly. config.data.radios stays
    // channel-keyed ({ channel, config }) — the per-channel preset/mode source.
    //
    // Only BluSeries receivers are still matched to a USB path (they remain on
    // the chokidar /dev/serial/by-path discovery path).
    if (!blu_receivers) {
      config.blu_receivers = this.default_config.blu_receivers
    }
    config.blu_receivers.forEach(radio => {
      const found_radio = RadioMaps.Blu.find(map_info => radio.channel == map_info.channel)
      if (found_radio) {
        // identified the radio in the radio map
        radio.path = found_radio.path
      }
    })
    return config
  }

  async load() {
    // check if config file exists
    const file_exists = await this.checkIfFileExists(this.config_filepath)

    let config
    if (file_exists != true) {
      config = this.default_config
    } else {
      // load config from file
      try {
        config = JSON.parse(fs.readFileSync(this.config_filepath).toString())

      } catch (e) {
        console.log('Station Config is corrupted, using default config', e)
        config = this.default_config
      }
    }

    this.data = this.threadRadioMapsWithConfig(config)
    return this.data
  }

  /**
   * save config to disk
   */
  save() {
    // strip dynamically-threaded Blu paths before persisting (re-threaded on
    // load). 434 radios are channel-keyed and carry no path.
    let cloned_config = JSON.parse(JSON.stringify(this.data))

    cloned_config.blu_receivers.forEach(receiver => {
      if (receiver.path) {
        delete receiver.path
        receiver.blu_radios.forEach((radio) => {
          delete radio.beeps
          delete radio.dropped
        })
      }
    })
    let contents = JSON.stringify(cloned_config, null, 2)
    fs.writeFileSync(this.config_filepath, contents)
  }

  /**
   * 
   * @param {Object} opts 
   * @param {Integer} opts.channel
   * @param {String} opts.cmd
   */
  async toggleRadioMode(opts) {
    console.log('station config toggle radio mode opts', opts)
    const radio = this.data.radios.find(radio => radio.channel == opts.channel)
    if (radio) {
      console.log('setting radio mode')
      radio.config = [
        opts.cmd
      ]
    }

    try {
      this.save(this.filename)
    } catch (err) {
      console.log('ERROR saving config file')
      console.error(err)
    }
  }

  /**
   * 
   * @param {Object} opts 
   * @param {Integer} opts.receiver_channel
   * @param {Integer} opts.blu_radio_channel
   * @param {Integer} opts.radio_state
   * @param {Integer} opts.poll_interval
   */
  async toggleBluRadio(opts) {
    const receiver = this.data.blu_receivers.find(receiver => receiver.channel == opts.receiver_channel)
    if (receiver) {
      const blu_radio = receiver.blu_radios.find(radio => radio.radio == opts.blu_radio_channel)
      blu_radio.radio_state = opts.radio_state
      blu_radio.poll_interval = opts.poll_interval
    }

    try {
      this.save(this.filename)
    } catch (err) {
      console.log('ERROR saving config file')
      console.error(err)
    }

  }
}

export { StationConfig }
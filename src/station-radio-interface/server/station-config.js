import fs from 'fs'
import default_config from './default-config.js'

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
  // Neither radio family is path-mapped any more: ctt-radio-driver and
  // ctt-blu-driver assign the channel via the socket name
  // (/run/ctt/{radios,blu}/ch<N>.sock), so base-station attaches by channel
  // directly and config.data.{radios,blu_receivers} stay channel-keyed. This
  // just fills in the default BluSeries receiver list when the config omits it.
  ensureBluReceivers(config) {
    if (!config.blu_receivers) {
      config.blu_receivers = this.default_config.blu_receivers
    }
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

    this.data = this.ensureBluReceivers(config)
    return this.data
  }

  /**
   * save config to disk
   */
  save() {
    // Don't persist transient per-radio runtime handles if any leaked onto the
    // config. Receivers are channel-keyed and carry no device path.
    let cloned_config = JSON.parse(JSON.stringify(this.data))

    cloned_config.blu_receivers?.forEach(receiver => {
      receiver.blu_radios?.forEach((radio) => {
        delete radio.beeps
        delete radio.dropped
      })
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
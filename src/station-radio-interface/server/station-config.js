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
    const { radios, blu_receivers } = config

    // thread 434 radio hardware maps inside config
    radios.forEach(radio => {
      const found_radio = RadioMaps.Radio.find(map_info => radio.channel == map_info.channel)
      if (found_radio) {
        // identified the radio in the radio map
        radio.path = found_radio.path
      }
    })
    // thread blu radio hardware maps inside config
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
    console.log('loading', this.config_filepath)
    const file_exists = await this.checkIfFileExists(this.config_filepath)

    let config
    if (file_exists != true) {
      console.log('loading default config')
      config = this.default_config
    } else {
      // load config from file
      console.log('loading config from file', this.config_filepath)
      config = JSON.parse(fs.readFileSync(this.config_filepath).toString())
    }

    this.data = this.threadRadioMapsWithConfig(config)
    return this.data
  }

  save() {
    // strip radio path from config to be threaded dynamically on load
    let cloned_config = JSON.parse(JSON.stringify(this.data))
    // console.log('station-config cloned config', cloned_config)
    cloned_config.radios.forEach(radio => {
      if (radio.path) {
        delete radio.path
      }
    })

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

  toggleRadioMode(opts) {
    console.log('toggle radio mode opts', opts)
    this.data.radios.forEach((radio) => {
      if (radio.channel == opts.channel) {
        console.log('setting radio mode')
        radio.config = [
          opts.cmd
        ]
      }
    })
    let receiver = this.data.blu_receivers.findIndex(receiver => receiver.channel == opts.receiver_channel)
    console.log('station config blu receivers', this.data.blu_receivers, 'indexed', this.data.blu_receivers[receiver])
    this.data.blu_receivers[receiver].blu_radios.forEach((radio) => {
      if (opts.poll_interval) {
        radio.poll_interval = opts.poll_interval
        radio.radio_state = opts.radio_state
      } else {
        radio.radio_state = opts.radio_state
      }
    })
    try {
      this.save(this.filename)
    } catch (err) {
      console.log('ERROR saving config file')
      console.error(err)
    }
  }
}

export { StationConfig }
import fs from 'fs'
import default_config from './default-config.js'

class StationConfig {
  /**
 * opts.config_filepath
 * opts.radio_map_filepath
   */
  constructor(opts) {
    this.config_filepath = opts.config_filepath
    this.radio_map_filepath = opts.radio_map_filepath
    this.blu_map_filepath = opts.blu_map_filepath
    this.default_config = default_config
    this.data
    console.log('station config opts', opts)
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
   * opts.radio_map
   * opts.config
   **/
  threadRadioMapWithConfig(opts) {
    let radios = opts.config.radios
    let found_radio
    radios.forEach(radio => {
      found_radio = opts.radio_map.find(map_info => radio.channel == map_info.channel)
      if (found_radio) {
        // identified the radio in the radio map
        radio.path = found_radio.path
      }
    })
    return opts.config
  }

  /**
 * opts.radio_map
 * opts.config
 **/
  threadBluRadioMapWithConfig(opts) {
    console.log('thread blu radio map opts config', opts.radio_map)
    let radios = opts.config.blu_receivers
    let found_radio
    radios.forEach(radio => {
      found_radio = opts.radio_map.find(map_info => radio.channel == map_info.channel)
      if (found_radio) {
        // identified the radio in the radio map
        radio.path = found_radio.path
      }
    })
    console.log('blu radios merged', radios)
    return radios
  }

  async load() {
    let config_file
    // make sure the radio map file exists or we can't do much...
    let file_exists = await this.checkIfFileExists(this.radio_map_filepath)
    if (file_exists != true) {
      throw new Error('cannot open the radio filepath')
    }
    // load radio mapping
    let radio_map_contents = fs.readFileSync(this.radio_map_filepath).toString()
    // console.log('radio map contents', JSON.parse(radio_map_contents))
    let radio_map = JSON.parse(radio_map_contents)
    // check if config file exists
    file_exists = await this.checkIfFileExists(this.config_filepath)
    // console.log('station config /etc/ctt/ file exists', file_exists)
    let blu_file_exists = await this.checkIfFileExists(this.blu_map_filepath)
    let config, blu_filemap, blu_contents
    if (file_exists != true) {
      config = this.loadDefaultConfig()
      console.log('loading default config')
    } else {
      config = fs.readFileSync(this.config_filepath).toString()
      config = JSON.parse(config)
    }

    if (blu_file_exists != true) {
      blu_filemap = this.loadDefaultConfig()
      console.log('loading default config')
    } else {
      blu_filemap = fs.readFileSync(this.blu_map_filepath).toString()
      blu_contents = JSON.parse(blu_filemap)
    }
    let merged_config = this.threadRadioMapWithConfig({
      radio_map: radio_map,
      config: config
    })
    let blu_receivers = this.threadBluRadioMapWithConfig({
      radio_map: blu_contents,
      config: config
    })
    // console.log('station config blu receivers', blu_receivers)
    // console.log('station config merged config', merged_config)
    // merged_config.data.blu_receivers = blu_receivers
    this.data = merged_config
    return merged_config
  }

  loadDefaultConfig() {
    return this.default_config
  }

  save() {
    // strip radio path from config to be threaded dynamically on load
    let cloned_config = JSON.parse(JSON.stringify(this.data))
    cloned_config.radios.forEach(radio => {
      if (radio.path) {
        delete radio.path
      }
    })
    let contents = JSON.stringify(cloned_config, null, 2)
    fs.writeFileSync(this.config_filepath, contents)
  }

  toggleRadioMode(opts) {
    this.data.radios.forEach((radio) => {
      if (radio.channel == opts.channel) {
        console.log('setting radio mode')
        radio.config = [
          opts.cmd
        ]
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

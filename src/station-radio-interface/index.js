import { BaseStation } from './server/base-station.js'

// instantiate the base station software
const StationFiles = {
  Config: '/etc/ctt/station-config.json',
  RadioMap: 'blah'
}
const station = new BaseStation({
  config_filepath: StationFiles.Config,
  radio_map_filepath: '/etc/ctt/radio-map.json'
})

// start it up
station.init({})

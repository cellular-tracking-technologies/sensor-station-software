import { BaseStation } from './server/base-station.js'

// instantiate the base station software
const config_filepath = '/etc/ctt/station-config.json'

// initialize the station
const station = new BaseStation(config_filepath)

// start it up
station.init({})

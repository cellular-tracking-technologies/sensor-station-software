import { StationLeds as StationLedsV2 } from './station-leds-v2.js'
import { StationLeds as StationLedsV3 } from './station-leds-v3.js'

import System from '../../../system.js'

const { Version } = System.Hardware

export default (Version >= 3) ? StationLedsV3 : StationLedsV2

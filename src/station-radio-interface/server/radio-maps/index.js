import V2RadioMap from './v2-radio-map.js'
import V3RadioMap from './v3-radio-map.js'
import V2BluRadioMap from './v2-blu-radio-map.js'
import V3BluRadioMap from './v3-blu-radio-map.js'

import System from '../../../system.js'
const { Version } = System.Hardware

const Maps = {
  Blu: V3BluRadioMap,
  Radio: V3RadioMap,
}

switch (Version) {
  case 3: {
    break
  }
  case 2: {
    Maps.Blu = V2BluRadioMap
    Maps.Radio = V2RadioMap
    break
  }
  default: {
    console.log('unexpected revision detected:', Version, 'defaulting to 3')
    break
  }
}

export default Maps
import V2RadioMap from './v2-radio-map.js'
import V3RadioMap from './v3-radio-map.js'
import V2BluRadioMap from './v2-blu-radio-map.js'
import V3BluRadioMap from './v3-blu-radio-map.js'

import System from '../../../system.js'
const { Revision } = System

const Maps = {
  Blu: V3BluRadioMap,
  Radio: V3RadioMap,
}

switch (Revision) {
  case 3: {
    break
  }
  case 2: {
    Maps.Blu = V2BluRadioMap
    Maps.Radio = V2RadioMap
    break
  }
  default: {
    console.log('unexpected revision detected:', Revision, 'defaulting to 3')
    break
  }
}

export default Maps
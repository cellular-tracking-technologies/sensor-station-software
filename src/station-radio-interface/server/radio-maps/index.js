import V3RadioMaps from './v3/index.js'
import V2RadioMaps from './v2/index.js'

import System from '../../../system.js'
const { Version, Revision } = System.Hardware

const Maps = {
  Blu: null,
  Radio: null,
}

switch (Version) {
  case 3: {
    // Handle Version 3 stations
    switch (Revision) {
      // Handle V3 Station Revisions
      case 2: {
        Maps.Blu = V3RadioMaps.R3.Blu
        Maps.Radio = V3RadioMaps.R3.Radio
        break
      }
      case 1:
      case 0:
        Maps.Blu = V3RadioMaps.R0.Blu
        Maps.Radio = V3RadioMaps.R0.Radio
      default: {
        console.log('Unhandled Station Revision - defaulting to R0 mapping for V3')
        Maps.Blu = V3RadioMaps.R0.Blu
        Maps.Radio = V3RadioMaps.R0.Radio
      }
    }
    break
  }
  case 2: {
    // Handle Version 2 stations
    Maps.Blu = V2RadioMaps.Blu
    Maps.Radio = V2RadioMaps.Radio
    break
  }
  default: {
    console.log('unexpected revision detected:', Version, 'defaulting to 3 Revision 3')
    Maps.Blu = V3RadioMaps.R3.Blu
    Maps.Radio = V3RadioMaps.R3.Radio
    break
  }
}

export default Object.freeze(Maps)
import { Led as V2LedDriver } from './v2-driver.js'
import { Led as V3LedDriver } from './v3-driver.js'

import System from '../system.js'
const { Version } = System.Hardware

let Led

if (Version >= 3) {
  Led = V3LedDriver
} else {
  Led = V2LedDriver
}

export { Led }

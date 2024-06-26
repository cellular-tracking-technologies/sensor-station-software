import SensorMonitorV2 from './v2-driver.js'
import SensorMonitorV3 from './v3-driver.js'
import System from '../../system.js'

const { Version } = System.Hardware

export default (Version >= 3) ? SensorMonitorV3 : SensorMonitorV2

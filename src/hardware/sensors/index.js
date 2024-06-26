import SensorMonitorV2 from './v2-driver.js'
import SensorMonitorV3 from './v3-driver.js'
import System from '../../system.js'

const { Revision } = System

export default (Revision >= 3) ? SensorMonitorV3 : SensorMonitorV2

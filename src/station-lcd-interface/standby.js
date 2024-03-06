import { WifiStrength } from './tasks/wifi-strength.js'

/**
 * 
 */
class StandBy {
    /**
     * 
     */
    constructor() {
        this.wifi = new WifiStrength()
        this.battery = new Battery()
        this.rtc = new Rtc()
        this.solar = new Solar()
        this.temperature = new Temperature()
        this.location = new Location()
        // this.cellular = new Cellular()

    }

}

export { StandBy }
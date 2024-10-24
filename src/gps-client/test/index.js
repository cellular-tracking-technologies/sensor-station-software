import { GpsClient } from '../index.js'

let gps = new GpsClient({ max_gps_records: 100 })
gps.start()

setInterval(() => {
    const info = gps.info()
    process.stdout.write(JSON.stringify(info.gps.time) + " " + JSON.stringify(info.mean) + "\r")
}, 1000)
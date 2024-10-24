import express from 'express'
import { GpsClient } from '../../gps-client/index.js'
var router = express.Router()

let gps = new GpsClient({ max_gps_records: 100 })
gps.start()

/* GET home page. */
router.get('/', function (req, res, next) {
    res.json(gps.info())
})

export default router

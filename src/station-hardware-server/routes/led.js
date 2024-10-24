import express from 'express'
import { GpsLed, DiagALed, DiagBLed } from '../../hardware/led-driver/v2-driver.js'
import System from '../../system.js'

const { Version } = System.Hardware

var router = express.Router()

if (Version < 3) {

    console.log('setting up V2 LED routing')
    let led_gps = new GpsLed()
    let led_diag_a = new DiagALed()
    let led_diag_b = new DiagBLed()

    led_gps.init()
    led_diag_a.init()
    led_diag_b.init()

    function setLedState(led, options) {

        const ret_ok = { res: true }
        const ret_err = { res: false }

        if (("state" in options) == false) {
            return ret_err
        }

        switch (options.state) {
            case 'on':
                led.on()
                break
            case 'off':
                led.off()
                break
            case 'toggle':
                led.toggle()
                break
            case 'blink':
                let blink_rate = 250
                if ("blink_rate_ms" in options) {
                    blink_rate = options.blink_rate_ms
                }
                led.blink(blink_rate)
                break
            default:
                console.log("default led")
                return ret_err
        }
        return ret_ok
    }

    router.post('/diag/a', function (req, res) {
        res.json(setLedState(led_diag_a, req.body))
    })
    router.post('/diag/b', function (req, res) {
        res.json(setLedState(led_diag_b, req.body))
    })
    router.post('/gps', function (req, res) {
        res.json(setLedState(led_gps, req.body))
    })
}

/* GET home page. */
router.get('/', function (req, res, next) {
    res.json({})
})

export default router

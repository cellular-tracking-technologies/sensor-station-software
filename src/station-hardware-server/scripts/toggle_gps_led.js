import { LedDriver } from './led-driver'
import fetch from 'node-fetch'
const fetch = require('node-fetch')

const led = new LedDriver()

fetch('http://localhost:3000/gps')
  .then(res => res.json())
  .then(json => {
    if (json.gps) {
      switch (json.gps.mode) {
        case 3:
          led.toggleGps({
            state: 'on'
          })
          break
        case 2:
          led.toggleGps({
            state: 'blink',
            blink_ms: 500
          })
          break
        case 1:
          led.toggleGps({
            state: 'blink',
            blink_ms: 200
          })
          break
        default:
          led.toggleGps({
            state: 'off'
          })
          break
      }
    }
  })
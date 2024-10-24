import { GpsLed, DiagALed, DiagBLed } from '../v3-driver.js';

let gps = new GpsLed()
let diag_a = new DiagALed()
let diag_b = new DiagBLed()

const run = async() => {
  await gps.on()
  await diag_a.on()
  await diag_b.on()

  gps.blink(500)
  diag_a.blink(250)
}

run()

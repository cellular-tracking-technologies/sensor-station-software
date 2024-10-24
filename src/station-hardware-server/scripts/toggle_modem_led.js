import icmp from 'icmp'
import { LedDriver } from './led-driver'

var count = 0
var loss = 0
var error = 0

let led_driver = new LedDriver()

icmp.send('4.2.2.2', "c")
  .then(obj => {
    if (obj.open == true) { count++; setTimeout(sample_b, 1000) }
    if (obj.open == false) { loss++; setTimeout(sample_b, 1000) }
  })
  .catch(err => failout())

function sample_b() {

  icmp.send('4.2.2.2', "c")
    .then(obj => {
      if (obj.open == true) { count++; setTimeout(sample_c, 1000) }
      if (obj.open == false) { loss++; setTimeout(sample_c, 1000) }
    })
    .catch(err => failout())
}

function sample_c() {

  icmp.send('4.2.2.2', "c")
    .then(obj => {
      if (obj.open == true) { count++; setTimeout(tallyCounts, 1000) }
      if (obj.open == false) { loss++; setTimeout(tallyCounts, 1000) }
    })
    .catch(err => failout())
}

function failout() {
  error = 1
  tallyCounts()
}



function tallyCounts() {
  console.log("Packets Received: " + count.toString())
  console.log("Packets Lost: " + loss.toString())
  console.log("Packets Error: " + error.toString())
  if (count < 3) {
    if (count > 0) {
      diagALight("blink")
    }
  }
  if (count == 3) {
    diagALight("on")
  }
  if (error > 0) {
    diagALight("off")
  }
  if (loss == 3) {
    diagALight("off")
  }
}

function diagALight(mode) {
  var rate
  if (mode == "blink") {
    rate = 100
    if (count == 2) { rate = 250 }
    if (count == 1) { rate = 1000 }
  }
  led_driver.toggleDiagB({
    state: mode,
    blink_ms: rate
  }).then((res) => {
    console.log('LED finished toggling to state', mode)
  }).catch((err) => {
    console.error('ERROR toggling LED light')
    console.error(err)
  })
}

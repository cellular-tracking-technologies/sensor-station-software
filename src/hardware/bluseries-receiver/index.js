import SerialClient from './driver/serial_client.js'
import fs from 'fs'
import Leds from './driver/leds.js'

import {BluReceiver, BluReceiverTask} from './blu-receiver.js'


SerialClient.find_port({ manufacturer: "FTDI" }).then((port) => {

  const driver = new BluReceiver({
    // path: port.path
    path: '/dev/ttyUSB0'
  })

  driver.on('complete', (job) => {
    switch (job.task) {
      case BluReceiverTask.VERSION:
        console.log(`BluReceiverTask.VERSION ${JSON.stringify(job) }`)
        break
      case BluReceiverTask.DETECTIONS:
        console.log(`BluReceiverTask.DETECTIONS ${job.data.length}`)
        break
      case BluReceiverTask.DFU:
        console.log(`BluReceiverTask.DFU ${JSON.stringify(job)}`)
        driver.schedule({ task: BluReceiverTask.REBOOT, radio_channel: 1 })
        break
      case BluReceiverTask.REBOOT:
        console.log(`BluReceiverTask.REBOOT ${JSON.stringify(job)}`)
        break
      case BluReceiverTask.LEDS:
        console.log(`BluReceiverTask.LEDS ${JSON.stringify(job)}`)
        break
      case BluReceiverTask.CONFIG:
        console.log(`BluReceiverTask.CONFIG ${JSON.stringify(job)}`)
        break    
      case BluReceiverTask.STATS:
        console.log(`BluReceiverTask.STATS ${JSON.stringify(job)}`)
        break 
      default:
        break
    }
  })

  driver.schedule({task: BluReceiverTask.VERSION, radio_channel: 1})
  driver.schedule({ task: BluReceiverTask.VERSION, radio_channel: 2})
  driver.schedule({ task: BluReceiverTask.VERSION, radio_channel: 3})
  driver.schedule({ task: BluReceiverTask.VERSION, radio_channel: 4})

  driver.schedule({
    task: BluReceiverTask.LEDS, radio_channel: 1,
    data: {
      led_channel: Leds.type.logo,
      state: Leds.state.blink,
      blink_rate_ms: 100,
      blink_count: Leds.utils.forever
  }})
  driver.schedule({
    task: BluReceiverTask.LEDS, radio_channel: 2,
    data: {
      led_channel: Leds.type.logo,
      state: Leds.state.blink,
      blink_rate_ms: 100,
      blink_count: Leds.utils.forever
    }
  })
  driver.schedule({
    task: BluReceiverTask.LEDS, radio_channel: 3,
    data: {
      led_channel: Leds.type.logo,
      state: Leds.state.blink,
      blink_rate_ms: 100,
      blink_count: Leds.utils.forever
    }
  })
  driver.schedule({
    task: BluReceiverTask.LEDS, radio_channel: 4,
    data: {
      led_channel: Leds.type.logo,
      state: Leds.state.blink,
      blink_rate_ms: 100,
      blink_count: Leds.utils.forever
    }
  })

  driver.schedule({ task: BluReceiverTask.STATS, radio_channel: 1 })

  // driver.schedule({
  //   task: BluReceiverTask.CONFIG, radio_channel: 1, data: {
  //   rx_blink: true,
  //   scan: true
  // }})

  // setTimeout(() => {
  //   driver.schedule({ task: BluReceiverTask.DETECTIONS, radio_channel: 1 })
  // }, 10000)

  driver.schedule({
    task: BluReceiverTask.DFU, radio_channel: 2,
    data: {
      file: fs.readFileSync('./driver/bin/blu_adapter_v2.0.0+0.bin')
  }})

  driver.schedule({
    task: BluReceiver.VERSION, radio_channel: 2,
  })

}).catch((err) => {
  console.log(err)
})
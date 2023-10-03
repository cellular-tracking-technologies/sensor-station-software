
import SerialClient from './driver/serial_client.js'
import fs from 'fs'
import Leds from './driver/leds.js'

import {BluReceiver, BluReceiverTask} from './blu-receiver.js'

SerialClient.find_port({ manufacturer: "FTDI" }).then((port) => {

  console.log('instantiating receiver', port)
  const { comName: path } = port
  console.log(path)
  const driver = new BluReceiver({
    path
  })

  driver.on('complete', (job) => {
    switch (job.task) {
      case BluReceiverTask.VERSION:
        console.log(JSON.stringify(job))
        break
      case BluReceiverTask.DETECTIONS:
        console.log(JSON.stringify(job))
      case BluReceiverTask.DFU:
        console.log(JSON.stringify(job))
      default:
        break
    }
  })

  driver.schedule({task: BluReceiverTask.VERSION, channel: 1})
  driver.schedule({task: BluReceiverTask.VERSION, channel: 2})
  driver.schedule({task: BluReceiverTask.VERSION, channel: 3})
  driver.schedule({task: BluReceiverTask.VERSION, channel: 4})

  driver.schedule({
    task: BluReceiverTask.LEDS, channel: 1,
    data: {
      channel: Leds.type.logo,
      state: Leds.state.blink,
      blink_rate_ms: 100,
      blink_count: Leds.utils.forever
  }})
  driver.schedule({
    task: BluReceiverTask.LEDS, channel: 2,
    data: {
      channel: Leds.type.logo,
      state: Leds.state.blink,
      blink_rate_ms: 100,
      blink_count: Leds.utils.forever
    }
  })
  driver.schedule({
    task: BluReceiverTask.LEDS, channel: 3,
    data: {
      channel: Leds.type.logo,
      state: Leds.state.blink,
      blink_rate_ms: 100,
      blink_count: Leds.utils.forever
    }
  })
  driver.schedule({
    task: BluReceiverTask.LEDS, channel: 4,
    data: {
      channel: Leds.type.logo,
      state: Leds.state.blink,
      blink_rate_ms: 100,
      blink_count: Leds.utils.forever
    }
  })

  driver.schedule({ task: BluReceiverTask.DETECTIONS, channel: 1 })

  // driver.schedule({
  //   task: BluReceiverTask.DFU, channel: 1,
  //   data: {
  //     file: fs.readFileSync('app_update_blink.bin')
  // }})

}).catch((err) => {
  console.log(err)
})

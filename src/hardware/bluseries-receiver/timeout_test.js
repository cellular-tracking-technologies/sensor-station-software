import SerialClient from './driver/serial_client.js'
import fs from 'fs'
import Leds from './driver/leds.js'

import { BluReceiver, BluReceiverTask } from './blu-receiver.js'


SerialClient.find_port({ manufacturer: "FTDI" }).then(async (port) => {

  const driver = new BluReceiver({
    // path: port.path
    path: '/dev/ttyUSB0'
  })

  driver.on('complete', (job) => {
    switch (job.task) {
      case BluReceiverTask.VERSION:
        console.log(`BluReceiverTask.VERSION ${JSON.stringify(job)}`)
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
  let times = 3

  let timeoutTest = async function (times) {
    try {
      await driver.schedule({ task: BluReceiverTask.LEDS, radio_channel: 4 })
      await driver.schedule({ task: BluReceiverTask.VERSION, radio_channel: 4 })
    } catch (e) {
      if (times > 0) {
        return await timeoutTest(times - 1)
      } else {

        console.error(e)
      }
      // return await timeoutTest()
    }
  }


  // driver.schedule({
  //   task: BluReceiverTask.LEDS, radio_channel: 4,
  //   data: {
  //     led_channel: Leds.type.logo,
  //     state: Leds.state.blink,
  //     blink_rate_ms: 100,
  //     blink_count: Leds.utils.forever
  //   }
  // })
  await timeoutTest()

}).catch((err) => {
  console.log(err)
})
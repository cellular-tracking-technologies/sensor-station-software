
import SerialClient from './driver/serial_client.js'
import fs from 'fs'
import Leds from './driver/leds.js'

import { BluReceiver, BluReceiverTask } from './blu-receiver.js'

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
        console.log(`BluReceiverTask.VERSION ${JSON.stringify(job.data.version)}`)
        break
      case BluReceiverTask.DETECTIONS:
        console.timeEnd('detect')
        console.log(`detections, ${job.data.length}`)
        console.log('job data', JSON.stringify(job.data))
        console.log(`BluReceiverTask.DETECTIONS ${job.data.length}`)

        break
        // console.log(JSON.stringify(job))
      case BluReceiverTask.DFU:
        console.log(`BluReceiverTask.DFU ${JSON.stringify(job)}`)
        break
      case BluReceiverTask.REBOOT:
        console.log(`BluReceiverTask.REBOOT ${JSON.stringify(job)}`)
        console.log('BluReceiverTask.REBOOT', job)
        
        console.log('Blu Receiver ', job.radio_channel, 'is rebooting', job.task, job.data)

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

  driver.schedule({ task: BluReceiverTask.VERSION, radio_channel: 1 })
  driver.schedule({ task: BluReceiverTask.VERSION, radio_channel: 2 })
  driver.schedule({ task: BluReceiverTask.VERSION, radio_channel: 3 })
  driver.schedule({ task: BluReceiverTask.VERSION, radio_channel: 4 })

  driver.schedule({
    task: BluReceiverTask.LEDS, radio_channel: 1,
    data: {
      led_channel: Leds.type.logo,
      state: Leds.state.blink,
      blink_rate_ms: 100,
      blink_count: Leds.utils.forever
    }
  })
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

  driver.schedule({
    task: BluReceiverTask.CONFIG, radio_channel: 1, data: {
      rx_blink: true,
      scan: true
    }
  })

  for(let i=0;i++;i <=4){
    console.log('radio channel', i)
    console.log(`BluReceiverTask.VERSION ${JSON.stringify(job.data.version)}`)
    driver.schedule({
      task: BluReceiverTask.REBOOT,
      radio_channel: i,
      // data,
    })
  }
    
  setInterval(() => {
    for(let i=0;i++;i <=4){
      console.log('radio channel', i)

      driver.schedule({ task: BluReceiverTask.DETECTIONS, radio_channel: i })
      driver.schedule({ task: BluReceiverTask.STATS, radio_channel: i})
    }
  }, 10000)

  // driver.schedule({
  //   task: BluReceiverTask.DFU, radio_channel: 1,
  //   data: {
  //     file: fs.readFileSync('app_update_blink.bin')
  // }})

}).catch((err) => {
  console.log(err)
})

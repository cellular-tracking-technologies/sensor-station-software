import { StationInfoPacket } from '../server/qaqc/station-info.js'
import { GpsPacket } from '../server/qaqc/gps.js'
import { SensorPacket } from '../server/qaqc/sensor.js'
import { HardwarePacket } from '../server/qaqc/hardware.js'
import { ModemPacket } from '../server/qaqc/modem.js'
import { QaqcReport } from '../server/qaqc/report.js'

let id = 'DEC502C4C7F9'
let sim = '8901260852391584018'
let imei = '861641041224048'
imei = '9823495082345'
sim = '35323194890745289'
// imei = '867459049273493'
// sim = '8901260852391574043'

let packet = new StationInfoPacket({
  station_id: id,
  sim: sim,
  imei: imei
})

console.log('--INFO--')
console.log(packet.packet.getMessageBytes())
console.log(packet.packet.base64())

packet = new GpsPacket({
  station_id: id,
  lat: 39.046821,
  lng: -74.923420667,
  nsats: 5,
  gps_time: "2020-05-19T15:03-0500",
  mode: 3
})

console.log('--GPS--')
console.log(packet.packet.getMessageBytes())
console.log(packet.packet.base64())


packet = new SensorPacket({
  station_id: id,
  battery: 12.2,
  solar: 15.4,
  rtc: 3.3,
  temp_c: 31,
})

console.log('--SENSOR--')
console.log(packet.packet.getMessageBytes())
console.log(packet.packet.base64())


packet = new HardwarePacket({
  station_id: id,
  usb_hub_count: 4,
  radio_count: 5,
  system_time: "2020-05-20T12:32-0400"
})

console.log('--HARDWARE--')
console.log(packet.packet.getMessageBytes())
console.log(packet.packet.base64())

packet = new ModemPacket({
  station_id: id,
  carrier: 'AT&T',
  network: 'LTE',
  signal: 88
})

console.log('--MODEM--')
console.log(packet.packet.getMessageBytes())
console.log(packet.packet.base64())

let report = new QaqcReport({
  station_id: id
})
report.getResults().then((results) => {
  let packets = report.generatePackets(results)

  Object.keys(packets).forEach((key) => {
    let packet = packets[key]
    console.log(key)
    console.log(packet.packet.base64())
  })
})
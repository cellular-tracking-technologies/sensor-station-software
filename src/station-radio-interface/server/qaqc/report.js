import url from 'url'
import fetch from 'node-fetch'
import { StationInfoPacket } from './station-info.js'
import { GpsPacket } from './gps.js'
import { SensorPacket } from './sensor.js'
import { HardwarePacket } from './hardware.js'
import { ModemPacket } from './modem.js'
import { ModuleIdPacket } from './module-id.js'
import { ModuleSpecsPacket } from './module-specs.js'

/**
 * generate a QAQC report by hitting hardware server endpoints, and provided station id / station stats
 */
class QaqcReport {
  constructor(opts) {
    this.station_id = opts.station_id
    this.stats = opts.stats
    this.hardware_server_url = 'http://localhost:3000'
    this.urls = {
      modem: url.resolve(this.hardware_server_url, '/modem'),
      gps: url.resolve(this.hardware_server_url, '/gps'),
      sensor: url.resolve(this.hardware_server_url, '/sensor/details'),
      hardware: url.resolve(this.hardware_server_url, '/peripherals'),
      about: url.resolve(this.hardware_server_url, '/about')
    }
    this.qaqc_tag = opts.qaqc_tag ? opts.qaqc_tag : '78787878'
    this.qaqc_beep_threshold = opts.qaqc_beep_threshold ? opts.qaqc_beep_threshold : 3
  }

  /**
   * poll hardware server for qaqc data to send
   */
  getResults() {
    return new Promise((resolve, reject) => {
      let promises = []
      let keys = [], url
      Object.keys(this.urls).forEach((key) => {
        url = this.urls[key]
        keys.push(key)
        promises.push(fetch(url).then(res => res.json()).catch((err) => {
          console.error('error fetching data', key)
          console.error(err)
          return null
        }))
      })
      Promise.all(promises).then((results) => {
        let data = {}
        let key
        results.forEach((result, i) => {
          key = keys[i]
          data[key] = results[i]
        })
        return data
      }).then((data) => {
        resolve(data)
      }).catch((err) => {
        console.error('error polling qaqc results')
        console.error(err)
        reject(err)
      })
    })
  }

  /**
   * format gps data
   * @param {*} gps_results data from gps daemon
   */
  getGpsData(gps_results) {
    let lat = 0
    let lng = 0
    let nsats = 0
    let mode = 0
    let gps_time = 0
    if (gps_results.gps) {
      lat = gps_results.gps.lat
      lng = gps_results.gps.lon
      gps_time = gps_results.gps.time
      mode = gps_results.gps.mode
    }
    if (gps_results.sky) {
      nsats = gps_results.sky.satellites.reduce((prev, current) => {
        if (current.used) {
          return prev += 1
        }
        return prev
      }, 0)
    }
    return {
      lat: lat,
      lng: lng,
      nsats: nsats,
      mode: mode,
      gps_time: gps_time
    }
  }

  /**
   * format modem info
   * @param {*} modem - modem data from modem daemon
   */
  getInfo(modem) {
    return {
      sim: modem.sim ? modem.sim : 0,
      imei: modem.imei ? modem.imei : 0
    }
  }

  /**
   * format sensor data
   * @param {*} sensor 
   */
  getSensorInfo(sensor) {
    let battery = 0
    let solar = 0
    let rtc = 0
    let temp_c = 0
    if (sensor.voltages) {
      battery = parseFloat(sensor.voltages.battery)
      solar = parseFloat(sensor.voltages.solar)
      rtc = parseFloat(sensor.voltages.rtc)
    }
    if (sensor.temperature) {
      temp_c = parseInt(sensor.temperature.celsius)
    }
    return {
      battery: battery,
      solar: solar,
      rtc: rtc,
      temp_c: temp_c
    }
  }

  /**
   * format hardware info - validate radio / usb hub counts
   * @param {*} hardware 
   */
  getHardwareInfo(hardware) {
    let now = new Date()
    let usb_hub_count = 0
    let radio_count = 0
    hardware.info.forEach((component) => {
      if (component.vendor == '239a') {
        if (component.product == '800c') {
          radio_count += 1
        }
      }

      if (component.vendor == '0424') {
        if (component.product == '2514') {
          usb_hub_count += 1
        }
      }
    })

    return {
      usb_hub_count: usb_hub_count,
      radio_count: radio_count,
      system_time: now.getTime()
    }
  }

  /**
   * parse signale strength, carrier, network from modem object
   * @param {*} modem 
   */
  getModemInfo(modem) {
    let signal = 0
    let carrier = ''
    let network = ''
    if (modem.carrier) {
      let values = modem.carrier.split(',')
      if (values.length == 2) {
        carrier = values[0].trim()
        network = values[1].trim()
      } else {
        carrier = modem.carrier
      }
      values = modem.signal.split(',')
      signal = parseInt(values[0])
    }
    return {
      signal: signal,
      carrier: carrier,
      network: network
    }
  }

  /**
   * analyze stats to validate a specified number of specific tag beeps were received
   */
  getQaqcTagResults() {
    let results = {
      1: false,
      2: false,
      3: false,
      4: false,
      5: false
    }
    Object.keys(this.stats).forEach((channel) => {
      let channel_data = this.stats[channel]
      // check for radio tag data
      Object.keys(channel_data.beeps).forEach((tag_id) => {
        if (tag_id == this.qaqc_tag) {
          let cnt = channel_data.beeps[tag_id]
          if (cnt > this.qaqc_beep_threshold) {
            results[channel] = true
          }
        }
      })
      // check for node tag data
      Object.keys(channel_data.nodes.beeps).forEach((tag_id) => {
        if (tag_id == this.qaqc_tag) {
          let cnt = channel_data.nodes.beeps[tag_id]
          if (cnt > this.qaqc_beep_threshold) {
            results[channel] = true
          }
        }
      })
    })
    return results
  }

  /**
   * format data about the module from the hardware server
   * 
   * @param {*} about 
   */
  getAbout(about) {
    let total_memory = 0, disk_size = 0
    total_memory = parseInt(Math.round(about.total_mem / 1024))
    disk_size = parseInt(Math.round(about.disk_usage.total))
    return {
      hardware: about.hardware ? about.hardware : '',
      revision: about.revision ? about.revision : '',
      serial: about.serial ? about.serial : '',
      total_memory: total_memory,
      disk_size: disk_size,
      image_date: about.station_image ? about.station_image : '1970-01-01',
      software_update: about.station_software ? about.station_software : '1970-01-01'
    }
  }

  /**
   * generate packets for building a qaqc report
   * @param {*} results - results from getResults
   */
  generatePackets(results) {
    let gps = this.getGpsData(results.gps)
    let gps_packet = new GpsPacket({
      station_id: this.station_id,
      lat: gps.lat,
      lng: gps.lng,
      nsats: gps.nsats,
      mode: gps.mode,
      gps_time: gps.gps_time
    })

    let info = this.getInfo(results.modem)
    let info_packet = new StationInfoPacket({
      station_id: this.station_id,
      sim: info.sim,
      imei: info.imei
    })

    let sensor = this.getSensorInfo(results.sensor)
    let sensor_packet = new SensorPacket({
      station_id: this.station_id,
      battery: sensor.battery,
      solar: sensor.solar,
      rtc: sensor.rtc,
      temp_c: sensor.temp_c
    })

    let hardware = this.getHardwareInfo(results.hardware)
    let channel_qaqc = this.getQaqcTagResults()
    let hardware_packet = new HardwarePacket({
      station_id: this.station_id,
      usb_hub_count: hardware.usb_hub_count,
      radio_count: hardware.radio_count,
      system_time: hardware.system_time,
      channel_qaqc: channel_qaqc
    })

    let modem = this.getModemInfo(results.modem)
    let modem_packet = new ModemPacket({
      station_id: this.station_id,
      signal: modem.signal,
      carrier: modem.carrier,
      network: modem.network
    })

    let about = this.getAbout(results.about)
    let module_id_packet = new ModuleIdPacket({
      station_id: this.station_id,
      hardware: about.hardware,
      serial: about.serial,
      revision: about.revision
    })

    let module_specs_packet = new ModuleSpecsPacket({
      station_id: this.station_id,
      total_memory: about.total_memory,
      disk_size: about.disk_size,
      image_date: about.image_date,
      software_update: about.software_update
    })

    return {
      info: info_packet,
      gps: gps_packet,
      sensor: sensor_packet,
      hardware: hardware_packet,
      modem: modem_packet,
      module_id: module_id_packet,
      module_specs: module_specs_packet
    }
  }
}

export { QaqcReport }
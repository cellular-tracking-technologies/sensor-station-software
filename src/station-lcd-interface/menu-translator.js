// Import Statements
import MenuItem from "./menu-item.js"
import MenuManager from "./menu-manager.js"
import translate from 'translate'

// Tasks
import { IpAddressTask } from "./tasks/ip-address-task.js"
import { CellularIds, CellularCarrier } from "./tasks/cellular-task.js"
import { GpsTask } from "./tasks/gps-task.js"
import { SensorTemperatureTask } from "./tasks/sensor-temp-task.js"
import { SensorVoltageTask } from "./tasks/sensor-voltage-task.js"
import { ServerConnectRequest } from "./tasks/server-task.js"
import { SystemImageTask, SystemIdsTask, SystemMemoryTask, SystemUptimeTask } from "./tasks/system-about-task.js"
import { SystemRestartTask } from "./tasks/system-restart-task.js"
import { SystemTimeTask } from "./tasks/system-time-task.js"
import { UsbDownloadTask } from "./tasks/usb-download-task.js"
import { MountUsbTask } from "./tasks/usb-mount-task.js"
import { UnmountUsbTask } from "./tasks/usb-unmount-task.js"
import { UsbWifiUploadTask } from "./tasks/usb-wifi-upload-task.js"
import { HostnameTask } from "./tasks/hostname-task.js"
import { InternetTask } from "./tasks/internet-task.js"
import { QaqcRequest } from './tasks/qaqc-task.js'
import { BashUpdateTask } from './tasks/bash-update.js'
import { EnableWifi, DisableWifi } from './tasks/enable-disable-wifi-task.js'
import { EnableModem, DisableModem } from './tasks/enable-disable-modem-task.js'
import { StandBy } from './standby.js'

/**
 * 
 */
class MenuTranslator {
  /**
   * 
   */
  constructor(opts) {
    this.language = opts.language
    // this.items = opts.items
    this.en_items
    this.es_items
  }

  async createItems() {
    let lang_string
    switch (this.language) {
      case 'en':
        lang_string = 'English'
        break
      case 'es':
        lang_string = 'Espagnol'
        break
      default:
        lang_string = 'English'
        break
    }
    const host = 'http://localhost:3000'
    this.items = new MenuItem('main', null, [
      new MenuItem('Station Stats', new StandBy(host), []),
      new MenuItem("File Transfer", null, [
        new MenuItem("Mount Usb", new MountUsbTask(host), []),
        new MenuItem("Unmount Usb", new UnmountUsbTask(host), []),
        new MenuItem("Download", new UsbDownloadTask(host), []),
        new MenuItem("Get WiFi", new UsbWifiUploadTask(host), [])
      ]),
      new MenuItem("System", null, [
        new MenuItem("About", null, [
          new MenuItem("Image", new SystemImageTask(host), []),
          new MenuItem("Ids", new SystemIdsTask(host), []),
          new MenuItem("Memory", new SystemMemoryTask(host), []),
          new MenuItem("Uptime", new SystemUptimeTask(host), [])
        ]),
        new MenuItem("QAQC", new QaqcRequest(host), []),
        new MenuItem("Time", new SystemTimeTask(host), []),
        new MenuItem("Restart", new SystemRestartTask(), []),
        new MenuItem("Bash Update", new BashUpdateTask(), [])
      ]),
      new MenuItem("Network", null, [
        new MenuItem('WiFi', null, [
          new MenuItem("Enable Wifi", new EnableWifi(host), []),
          new MenuItem("Disable Wifi", new DisableWifi(host), []),
        ]),
        new MenuItem("Cellular", null, [
          new MenuItem('Enable Modem', new EnableModem(host), []),
          new MenuItem('Disable Modem', new DisableModem(host), []),
          new MenuItem("Ids", new CellularIds(host), []),
          new MenuItem("Carrier", new CellularCarrier(host), [])
        ]),
        new MenuItem("Ping", new InternetTask(host), []),
        new MenuItem("Hostname", new HostnameTask(), []),
        new MenuItem("Ip Address", new IpAddressTask(), []),
      ]),
      new MenuItem("Server", new ServerConnectRequest(host), []),
      new MenuItem("Power", new SensorVoltageTask(host), []),
      new MenuItem("Temperature", new SensorTemperatureTask(host), []),
      new MenuItem("Location", new GpsTask(host), []),
    ])
  }
  async translateString(str, translateTo) {
    translate.engine = 'google'
    const translated_string = await translate(str, translateTo)
    // console.log('translated string', translated_string)
    return translated_string
  }

  async translateMenu() {
    await this.createItems()
    // make true copy of menu object
    // menu = JSON.parse(JSON.stringify(menu))
    for await (let child of this.items.children) {
      let translated_child = await this.translateString(child.id, this.language)
      // console.log('translated child', translated_child)
      child.id = translated_child
      // console.log('child id after translation', child.id)

      if (child.children) {
        for await (let subchild of child.children) {
          // console.log('subchild', subchild)
          let translated_child = await this.translateString(subchild.id, this.language)
          // console.log('translated subchild', translated_child)
          subchild.id = translated_child
          // console.log('subchild id after translation', subchild.id)
          if (subchild.children) {
            for await (let ter_child of subchild.children) {
              // console.log('tertiary child', ter_child)
              let translated_child = await this.translateString(ter_child.id, this.language)
              // console.log('translated tertiary child', translated_child)
              ter_child.id = translated_child
              // console.log('tertiary child id after translation', ter_child.id)
            }
          }
        }
      }
    }
    return this.items
  }
}

export default MenuTranslator
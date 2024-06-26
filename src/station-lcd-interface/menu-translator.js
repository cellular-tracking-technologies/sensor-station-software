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
    this.items
    this.lang_string
  }

  async createItems() {
    switch (this.language) {
      case 'en':
        this.lang_string = 'English'
        break
      case 'es':
        this.lang_string = 'Espagnol'
        break
      case 'fr':
        this.lang_string = 'Francais'
        break
      case 'pt':
        this.lang_string = 'Portugues'
        break
      case 'nl':
        this.lang_string = 'Nederlands'
        break
      default:
        this.lang_string = 'English'
        break
    }
    const host = 'http://localhost:3000'

    this.items = new MenuItem(this.lang_string, null, [
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

    this.items.id = this.lang_string

    for await (let child of this.items.children) {
      child.id = await this.translateString(child.id, this.language)

      if (child.children) {
        for await (let subchild of child.children) {
          subchild.parent_id = await this.translateString(subchild.parent_id, this.language)
          subchild.id = await this.translateString(subchild.id, this.language)

          if (subchild.children) {
            for await (let ter_child of subchild.children) {
              ter_child.parent_id = await this.translateString(ter_child.parent_id, this.language)
              ter_child.id = await this.translateString(ter_child.id, this.language)
            }
          }
        }
      }
    }
    return this.items
  }
}

export default MenuTranslator
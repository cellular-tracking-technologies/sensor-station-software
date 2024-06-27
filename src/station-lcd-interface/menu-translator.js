// Import Statements
import MenuItem from "./menu-item.js"
import translate from 'translate'
// import languages from './translated-menus.json' assert { type: 'json'}
import fs from 'node:fs/promises'


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
    // this.language = opts.language
    this.items
    this.lang_string
    this.lang_abbrev
    this.language_items
    this.language_array = []
  }

  async createItems(language) {

    const host = 'http://localhost:3000'

    this.items = new MenuItem(language, null, [
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
    return translated_string
  }

  async translateMenu(language) {

    await this.createItems(language)

    switch (language) {
      case 'English':
        this.lang_string = 'en'
        break
      case 'Espagnol':
        this.lang_string = 'es'
        break
      case 'Francais':
        this.lang_string = 'fr'
        break
      case 'Portugues':
        this.lang_string = 'pt'
        break
      case 'Nederlands':
        this.lang_string = 'nl'
        break
      default:
        this.lang_string = 'en'
        break
    }

    this.items.id = language
    for await (let child of this.items.children) {
      child.id = await this.translateString(child.id, this.lang_string)

      if (child.children) {
        for await (let subchild of child.children) {
          subchild.parent_id = await this.translateString(subchild.parent_id, this.language)
          subchild.id = await this.translateString(subchild.id, this.lang_string)

          if (subchild.children) {
            for await (let ter_child of subchild.children) {
              ter_child.parent_id = await this.translateString(ter_child.parent_id, this.lang_string)
              ter_child.id = await this.translateString(ter_child.id, this.lang_string)
            }
          }
        }
      }

    }

    this.language_items = { [this.lang_string]: this.items }
    // this.language_array.push(this.language_items)

    await fs.writeFile('translated-menus.json', JSON.stringify(this.language_items), {}, (err) => {
      if (err) {
        console.log('could not save translated menus', err)
      } else {
        console.log('translated menus saved!!!\n')
      }
    })

    let data = JSON.parse(await fs.readFile('/translated-menus.json', 'utf8'))
    console.log('data after being parsed', data)
    // let new_data = Object.assign(this.language_items, data)
    this.language_array.push(this.language_items)

    console.log('data after assignment', this.language_array)

    await fs.writeFile('translated-menus.json', JSON.stringify(this.language_array), {}, (err) => {
      if (err) {
        console.log('could not save translated menus', err)
      } else {
        console.log('translated menus saved!!!\n')
      }
    })
    return this.items
  }

  async menuSwitchStrings(language) {
    await this.createItems(language)
    // console.log('this items', this.items)

    let translation = Object.values((languages)).find(e => language == e.id)
    // console.log('translated object', translation.children[1].children[0])

    this.items.id = translation.id
    if (this.items.children) {
      // console.log('items children', this.items.children)
      for (let i = 0; i < this.items.children.length; i++) {
        // console.log('items children element', this.items.children[i])

        this.items.children[i].parent_id = translation.children[i].parent_id
        this.items.children[i].id = translation.children[i].id

        if (this.items.children[i].children) {
          // console.log('subitems children element', this.items.children[i].children)

          for (let j = 0; j < this.items.children[i].children.length; j++) {

            this.items.children[i].children[j].parent_id = translation.children[i].children[j].parent_id
            this.items.children[i].children[j].id = translation.children[i].children[j].id
            if (this.items.children[i].children[j].children) {

              for (let k = 0; k < this.items.children[i].children[j].children.length; k++) {
                // console.log('ter items children element', this.items.children[i].children[j].children)

                this.items.children[i].children[j].children[k].parent_id = translation.children[i].children[j].children[k].parent_id
                this.items.children[i].children[j].children[k].id = translation.children[i].children[j].children[k].id

              }
            }
          }
        }
      }
    }
    return this.items
  }
}

export default MenuTranslator
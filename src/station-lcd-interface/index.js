// Import Statements
import MenuItem from "./menu-item.js"
import MenuManager from "./menu-manager.js"

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
import { Gpio } from 'onoff' // RaspberryPI Gpio functions
import { StandBy } from './standby.js'
import GpioMap from '../hardware/pi/gpio-map.js'

const { Buttons: ButtonMap } = GpioMap

// Require Statements

// App Config

const host = 'http://localhost:3000'

/*
    Build the menu: Each item MUST be given:
        A) 'name' for selecting/traversings menu-items on the screen
        B) A task to be rendered when the menu item is 'selected'
            Note: If item is a submenu, set view to null as the next menu will
                be rendered in-leui of a task.
        C) List of children, which must be of type MenuItem
            Note: If item has no children, set to []

    Note: All menu items must have unique names!
*/

// let stand_by = new MenuItem('stand-by', new StandBy(host), [])

let items = new MenuItem("main", null, [
  // new MenuItem('StandBy', new StandBy(host), []),

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
    new MenuItem("Enable Wifi", new EnableWifi(host), []),
    new MenuItem("Disable Wifi", new DisableWifi(host), []),
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


/*
    Instantiate a menu manager that operates on a list of 
    menu items organized within a hierarchical structure.
    The manager is capable of traversing the menu items using
    the following commands:
        A) up()     - Traverse 'up' a list of items in a dir
        B) down()   - Traverse 'down' a list of items in a dir
        C) select() - Enters a dir within a menu.
        D) back()   - Exits a dir within a menu.
*/

let menu = new MenuManager(items)
menu.init()

let standby_item = new MenuItem('StandBy', new StandBy(host), [])
let standby_menu = new MenuManager(standby_item)

setInterval(async () => {
  standby_menu.init()
  standby_menu.select()
  // standby_class.clearScreen()
  // await standby_class.results()
}, 10000)

/*
    Configure Pi buttons and mount callbacks for when they are pushed.
    The push callbacks will trigger menu operations corresponding to 
    the specific buttons pressed. 
    
    Note: Debounce is common feature to prevent buttons from being 
    pressed multiple times in rapid sucession.
*/
const button_up = new Gpio(ButtonMap.Up, 'in', 'rising', { debounceTimeout: 50 })
button_up.watch((err, value) => {
  if (err) {
    throw err
  }
  menu.up()
})

const button_down = new Gpio(ButtonMap.Down, 'in', 'rising', { debounceTimeout: 50 })
button_down.watch((err, value) => {
  if (err) {
    throw err
  }
  menu.down()
})

const button_select = new Gpio(ButtonMap.Select, 'in', 'rising', { debounceTimeout: 50 })
button_select.watch((err, value) => {
  if (err) {
    throw err
  }
  menu.select()
})

const button_back = new Gpio(ButtonMap.Back, 'in', 'rising', { debounceTimeout: 50 })
button_back.watch((err, value) => {
  if (err) {
    throw err
  }
  menu.back()
})

// Import Statements
import MenuItem from "./menu-item.js"
import MenuManager from "./menu-manager.js"
import MenuTranslator from './menu-translator.js'

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
import { ProgramRadios } from './tasks/program-radios.js'
import { StationStats } from './station-stats.js'
import GpioMap from '../hardware/pi/gpio-map.js'
import { Gpio } from 'onoff' // RaspberryPI Gpio functions
import items from './menu-items.js'
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

let menu_translator = new MenuTranslator()

/**Uncomment the following lines to get an updated translated menus**/

let language_object = await menu_translator.translateMenu()
await menu_translator.saveTranslatedMenus(language_object)

// let en_items = await menu_translator.menuSwitchStrings('English')
let es_items = await menu_translator.menuSwitchStrings('Espagnol')
let fr_items = await menu_translator.menuSwitchStrings('Francais')
let pt_items = await menu_translator.menuSwitchStrings('Portugues')
let nl_items = await menu_translator.menuSwitchStrings('Nederlands')

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

let languages = new MenuItem('Languages', null, [es_items, fr_items, pt_items, nl_items])
items.children[8] = languages
items.children[8].parent_id = 'main'
// console.log('items', items)

let menu = new MenuManager(items)
// console.log('menu', menu)
menu.init()

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



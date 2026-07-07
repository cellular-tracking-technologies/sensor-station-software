import '../station-utils/prefer-ipv4.js'
// Import Statements
import MenuItem from "./menu-item.js"
import MenuManager from "./menu-manager.js"
import MenuTranslator from './menu-translator.js'
import display from './display-driver.js'

import { watchButtons } from './button-input.js'
import { watchRadioInterface } from './radio-watch.js'

// Require Statements

// App Config

const host = 'http://127.0.0.1:3000'

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
/**ALWAYS COMMENT OUT BELOW LINES BEFORE COMMITTING CHANGES!!! */

// let language_object = await menu_translator.translateMenu()
// await menu_translator.saveTranslatedMenus(language_object)

let items = await menu_translator.menuSwitchStrings('English')
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
items.children[8].parent_id = 'English'

let menu = new MenuManager(items)
menu.init()

/*
    Front-panel buttons are kernel gpio-keys input devices (their overlays are
    part of the canonical config.txt applied by ctt-device-config; see
    system/device-tree/). watchButtons reads their key-press
    events and triggers the matching menu operation; the kernel handles edge
    detection and debounce.
*/
watchButtons({
  up: () => menu.up(),
  down: () => menu.down(),
  select: () => menu.select(),
  back: () => menu.back(),
})

/*
    No custom SIGTERM/SIGINT handler here: registering one suppresses Node's
    default terminate-on-signal, and a graceful handler that paints the LCD then
    calls process.exit() can stall on flushing this (chatty) process's stdout to
    journald — which made every stop/restart/reboot wait out the stop timeout and
    then SIGKILL. Letting Node default-terminate makes the service stop instantly,
    like the other Node units. The reboot "stale menu" case is already handled by
    the native ctt-lcd daemon, which paints "Shutting down..." on its own SIGTERM.
*/

/*
    Surface a front-panel warning if radio acquisition (station-radio-interface)
    stops for any reason — a crash there otherwise only shows on a status LED,
    which is easy to miss. The warning re-asserts while the service is down and
    the menu is redrawn once it recovers.
*/
watchRadioInterface({
  onDown: () => display.writeNow([
    ' *** RADIO FAULT ***',
    '',
    ' Radio interface is',
    ' not running',
  ]),
  onUp: () => menu.update_(),
})



// Import Statements
import MenuItem from "./menu-item.js"
import MenuManager from "./menu-manager.js"
import MenuTranslator from './menu-translator.js'
import display from './display-driver.js'

import { watchButtons } from './button-input.js'

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
    Front-panel buttons are kernel gpio-keys input devices (see
    system/scripts/buttons-overlay.sh). watchButtons reads their key-press
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
    On shutdown (service stop / reboot), repaint the panel so it shows the menu
    interface is no longer running rather than leaving a stale, live-looking
    menu behind. The native ctt-lcd daemon keeps rendering frames, so this final
    frame stays up if only this service stops. On a full reboot ctt-lcd then
    overwrites it with its own "Shutting down..." splash, which is fine.
*/
const shutdown = () => {
  try {
    display.writeNow([' CTT Sensor Station', '', '  Interface stopped', ''])
  } catch (err) {
    // Best effort — never block exit on the display.
  }
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)



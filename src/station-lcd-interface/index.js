// Import Statements
import MenuItem from "./menu-item.js"
import MenuManager from "./menu-manager.js"
import MenuTranslator from './menu-translator.js'


import GpioMap from '../hardware/pi/gpio-map.js'
import { Gpio } from 'onoff' // RaspberryPI Gpio functions

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



// console.log('menu items', items)
let en_items = await new MenuTranslator({ language: 'en' }).translateMenu()
console.log('english items', en_items)
let es_items = await new MenuTranslator({ language: 'es' }).translateMenu()
let fr_items = await new MenuTranslator({ language: 'fr' }).translateMenu()

let languages = new MenuItem("languages", null, [
  new MenuItem('English', null, [en_items]),
  new MenuItem('Espagnol', null, [es_items]),
  new MenuItem('Francais', null, [fr_items]),
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

let menu = new MenuManager(languages)
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



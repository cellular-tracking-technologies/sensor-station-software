// Import Statements
import MenuScroller from './menu-scroller.js'
import display from './display-driver.js'

/**
 * 
 */
class MenuManager {
  /**
   * @param {Object} menu - Accepts root MenuItem object of a MenuItem tree
   */
  constructor(menu) {
    this.menu = menu
    this.focus = menu
    this.scroller = new MenuScroller()
    this.refresh_
  }
  init() {
    this.scroller.init(this.focus.childrenNames())

    display.init().then(() => {
      this.update_()
    }).catch((err) => {
      throw (err)
    })
  }
  up() {
    this.autoRefresh_(false)
    this.scroller.up()
    this.update_()
  }
  down() {
    this.autoRefresh_(false)
    this.scroller.down()
    this.update_()
  }
  select() {
    this.autoRefresh_(false)

    /*
    User enters custom view from custom view.
    Potential Behaviors:
        A) Nothing Happens
        B) Update Values in Custom View
        C) Perform some task for each push of select
    */
    if (this.focus.childCount() == 0) {
      if (this.focus.view != null) {
        console.log('this view', this.view_())

        this.view_()
        return
      }
    }

    // Launch a custom view by way of submenu transition.
    let row = this.focus.getChild(this.scroller.getSelectedRow())
    if (row.view != null) {
      this.focus = row
      // console.log('this view', this.view_())

      this.view_()
      return
    }
    // User Enters a sub menu
    if (row.childCount() > 0) {
      this.scroller.init(row.childrenNames())
      this.focus = row
    }
    this.update_()
  }
  back() {
    this.autoRefresh_(false)
    if (this.focus.parent_id != null) {
      this.focus = this.findMenuItem_(this.menu, this.focus.parent_id)
      this.scroller.init(this.focus.childrenNames())
    }
    this.update_()
  }
  view_() {
    display.write(this.focus.view.loading())

    this.focus.view.results().then((rows) => {
      if (rows != null) {
        display.write(rows)
      }
      this.autoRefresh_(true)
    }).catch((err) => {
      display.write(["Error", err, "", ""])
    })
  }
  update_() {
    let rows = this.scroller.getRows()
    let selected_row = this.scroller.getSelectedRow()

    let formatted = []
    rows.forEach(element => {
      if (selected_row == element) {
        formatted.push(`> ${element}`)
      } else {
        formatted.push(`  ${element}`)
      }
    })

    display.write(formatted)
  }
  autoRefresh_(enable) {
    clearTimeout(this.refresh_)
    if (enable == true) {
      if (typeof this.focus.view.autoRefresh !== 'undefined') {
        if (this.focus.view.autoRefresh > 0) {
          this.refresh_ = setTimeout(() => {
            this.view_()
          }, this.focus.view.autoRefresh)
        }
      }
    }
  }
  findMenuItem_(menu, id) {
    // console.log('find menu item', menu, id)
    if (menu.id == id) {
      return menu
    } else if (menu.childCount() > 0) {
      let result = null
      for (let i = 0; i < menu.childCount(); i++) {
        result = this.findMenuItem_(menu.children[i], id)
        // console.log('find menu item result', result)
        if (result != null) {
          break
        }
      }
      return result
    }
    return null
  }
}

export default MenuManager

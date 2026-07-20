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
    // Navigation breadcrumb: push the current focus when descending into a
    // submenu or a view, pop it on back(). Object-based, so back() never depends
    // on resolving a parent_id by name — which broke (and bricked the whole UI
    // via an unhandled TypeError) when a translated parent_id matched no tree id.
    this.stack = []
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
        this.view_()
        return
      }
    }

    // Launch a custom view by way of submenu transition.
    let row = this.focus.getChild(this.scroller.getSelectedRow())
    if (row.view != null) {
      this.stack.push(this.focus)
      this.focus = row
      this.view_()
      return
    }
    // User Enters a sub menu
    if (row.childCount() > 0) {
      this.stack.push(this.focus)
      this.scroller.init(row.childrenNames())
      this.focus = row
    }
    this.update_()
  }
  back() {
    this.autoRefresh_(false)
    // Pop to the menu we descended from. At the root the stack is empty, so
    // back() re-renders in place rather than stranding focus on a null lookup.
    if (this.stack.length > 0) {
      this.focus = this.stack.pop()
      this.scroller.init(this.focus.childrenNames())
    }
    this.update_()
  }
  view_(refresh = false) {
    // On first entry show the view's loading placeholder (Station Stats returns
    // [] to clear the menu underneath). On an auto-refresh, do NOT blank — keep
    // the current frame until results() re-renders, so a slow or failed refresh
    // can never leave the screen blank.
    if (!refresh) {
      display.write(this.focus.view.loading())
    }

    this.focus.view.results().then((rows) => {
      if (rows != null) {
        display.write(rows)
      }
      this.autoRefresh_(true)
    }).catch((err) => {
      display.write(["Error", String(err), "", ""])
      // Re-arm on failure too, so a bad cycle can never permanently stop the
      // refresh loop (which previously stranded the view on a blank screen).
      this.autoRefresh_(true)
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
      // Guard against focus having moved to a view-less menu node (or been
      // popped) while a refresh cycle was in flight. Without this, a refresh
      // that resolves/rejects after navigation dereferences a null `view` and
      // throws, clearing the timer without re-arming it — which permanently
      // freezes the display on its last frame.
      if (this.focus && this.focus.view && typeof this.focus.view.autoRefresh !== 'undefined') {
        if (this.focus.view.autoRefresh > 0) {
          this.refresh_ = setTimeout(() => {
            this.view_(true)
          }, this.focus.view.autoRefresh)
        }
      }
    }
  }
}

export default MenuManager

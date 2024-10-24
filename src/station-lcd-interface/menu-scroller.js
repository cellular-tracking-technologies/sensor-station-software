class MenuScroller {
  constructor(window_size = 4) {
    this.window_size_ = window_size
    this.rows_ = []
    this.first_
    this.last_
    this.selected_
  }
  init(rows) {
    this.rows_ = rows
    this.first_ = 0
    this.last_ = this.first_ + this.window_size_
    this.selected_ = this.first_
  }
  getRows() {
    return this.rows_.slice(this.first_, this.last_)
  }
  getSelectedRow() {
    let r = this.getRows()
    return r[this.selected_ - this.first_]
  }
  up() {
    if (this.selected_ > 0) {
      this.selected_--
      if (this.selected_ < this.first_) {
        this.scrollUp_()
      }
    }
  }
  down() {
    if (this.selected_ < this.rows_.length - 1) {
      this.selected_++
      if (this.selected_ >= this.last_) {
        this.scrollDown_()
      }
    }
  }
  scrollUp_() {
    if (this.first_ > 0) {
      this.first_--
      this.last_--
    }
  }
  scrollDown_() {
    if (this.last_ < this.rows_.length) {
      this.last_++
      this.first_++
    }
  }
}

export default MenuScroller
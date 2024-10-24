class MenuItem {
  constructor(id, view, children) {
    this.id = id
    this.parent_id = null
    this.children = []

    this.setChildren_(children)
    this.view = view
  }
  setChildren_(children) {
    let parent_id = this.id
    this.children = children.map((child) => {
      child.parent_id = parent_id
      return child
    })
  }
  childCount() {
    return this.children.length
  }
  getChild(id) {
    return this.children.find(obj => (obj.id == id))
  }
  childrenNames() {
    let ids = []
    this.children.forEach(child => {
      ids.push(child.id)
    })
    return ids
  }
}

export default MenuItem
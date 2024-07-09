import { execSync } from 'child_process'

export default Object.freeze({
  /**
   * List objects on the USB bus
   * @returns {Array}
   */
  ListUsb: () => {
    const output = execSync("lsusb").toString()
    let records = []
    // for each lsusb record - pull out device id, vendor id, product id and name
    output.split('\n').forEach((line) => {
      const fields = line.split(' ')
      if (fields.length > 6) {
        const ids = fields[5]
        const values = ids.split(':')
        records.push({
          device: fields[3],
          vendor: values[0],
          product: values[1],
          name: fields.slice(6,).join(' ').trim()
        })
      }
    })
    return records
  },
  /**
   * List FunCubes on the system using the fcd command
   * @returns {Array}
   */
  ListFunCubes: () => {
    const output = execSync("fcd -l").toString().trim()
    const records = []
    const lines = output.split('\n').map(line => line.trim())
    // shift out the header - "These FCDs found:"
    lines.shift()
    lines.forEach((line) => {
      const info = {}
      const fields = line.split(';')
      fields.forEach((field) => {
        const [key, value] = field.split(': ')
        info[key.trim()] = value.trim()
      })
      records.push(info)
    })
    return records
  },
})

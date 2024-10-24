import fs from 'fs'
import StationIdInterface from './station-id-interface.js'

/**
 * utilities to get station id
 * station id should be written to disk on boot
 * options to read directly from chip
 */
export default {
  FromFile: () => {
    return fs.readFileSync('/etc/ctt/station-id').toString().trim()
  },
  FromChip: async () => {
    const id_interface = new StationIdInterface()
    const info = await id_interface.getHardwareInfo()
    const { id } = info
    return id
  }
}

import { execSync } from 'child_process'

/**
 * 
 * @param {String} path modem path ex /org/freedesktop/ModemManager1/Modem/0
 * @returns 
 */
const getIndexFromPath = (path) => {
  return parseInt(path.split('/').pop())
}

/**
 * use modemmanager to list modems
 * @returns index of modem 
 */
const getModemIndex = () => {
  try {
    // execute mmcli to list modems on the bus
    const info = JSON.parse(execSync("mmcli -J -L"))
    // if multiple modems found - assume use first in list or none
    const path = info['modem-list'].shift()
    return path ? getIndexFromPath(path) : null
  } catch (err) {
    console.error(`unable to list modems`)
    console.error(err)
    return null
  }
}

/**
 * 
 * @param {Object} opts 
 * @param {Integer} opts.modem_index 
 * @param {Integer} opts.sim_index
 * @returns {Object|null}
 */
const pollSimInfo = (opts) => {
  const { modem_index, sim_index } = opts
  try {
    const info = JSON.parse(execSync(`mmcli -J -m ${modem_index} -i ${sim_index}`))
    return info
  } catch (err) {
    console.error(`unable to poll modem index ${index}`)
    console.error(err)
    return null
  }
}

/**
 * 
 * @param {Integer} modem_index modemmanager index for modem to poll
 * @returns {Object|null}
 */
const pollModemInfo = (modem_index) => {
  try {
    const info = JSON.parse(execSync("mmcli -J -m " + modem_index))
    const { modem } = info
    const broadband = modem['3gpp']
    const { generic: generic_info } = modem
    const { sim: sim_path } = generic_info
    const sim_index = getIndexFromPath(sim_path)
    const sim_info = pollSimInfo({ modem_index, sim_index })
    const signal = generic_info['signal-quality']
    return {
      signal: signal.value,
      imsi: sim_info.sim.properties.imsi,
      imei: broadband.imei,
      sim: sim_info.sim.properties.iccid,
      info: generic_info.model + ' - ' + generic_info.revision,
      creg: broadband['registration-state'],
      carrier: broadband['operator-name'],
      access_tech: generic_info['access-technologies'],
      tower: broadband['operator-code'],
    }
  } catch (err) {
    console.error(`unable to poll modem index ${modem_index}`)
    console.error(err)
    return null
  }
}

/**
 * utility for polling information about a modem on the bus
 */
export default Object.freeze({
  info: () => {
    const index = getModemIndex()
    return (index >= 0) ? pollModemInfo(index) : null
  }
})
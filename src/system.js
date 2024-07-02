import fs from 'fs'
import { execSync } from 'child_process'
import StationIdInterface from './hardware/id-driver/station-id-interface.js'

// Relavant system files
const Files = {
  Image: '/etc/ctt/station-image',
  Bootcount: '/etc/bootcount',
  ProcFile: '/proc/cpuinfo',
}

/**
 * 
 * @returns {Object}
 */
const getModuleDetails = () => {
  const results = {
    Hardware: null,
    Revision: null,
    Serial: null,
  }
  const contents = fs.readFileSync(Files.ProcFile).toString()
  contents.split('\n').forEach((line) => {
    line = line.trim()
    const vals = line.split(':')
    if (vals.length == 2) {
      const key = vals[0].trim()
      const value = vals[1].trim()
      switch (key) {
        case 'Hardware':
          results.Hardware = value
          break
        case 'Revision':
          results.Revision = value
          break
        case 'Serial':
          results.Serial = value
          break
        default:
        // ignore others (processor info)
      }
    }
  })
  return results
}

const getDistribution = () => {
  const Distribution = execSync('lsb_release -a').toString().trim()
  const Info = {}
  Distribution.split('\n').forEach((line) => {
    const [key, value] = line.split(':')
    Info[key.trim()] = value.trim()
  })
  Info.Release = parseInt(Info.Release)
  const { Release, Codename } = Info
  return {
    Release,
    Codename,
  }
}

// fetch module info 
const Module = getModuleDetails()
// fetch the distribution information 
const Os = getDistribution()

// parse station version / revision once
const id_interface = new StationIdInterface()
const {
  version: Version,
  revision: Revision,
  id: Id,
} = await id_interface.getHardwareInfo()

// parse station image date
const Image = new Date(fs.readFileSync(Files.Image).toString())

// parse boot count
const BootCount = parseInt(fs.readFileSync(Files.Bootcount))

export default Object.freeze({
  Image,
  Hardware: {
    Version,
    Revision,
    Id,
  },
  Module,
  Os,
  BootCount,
})
import fs from 'fs'
import { execSync } from 'child_process'
import StationFiles from './station-files.js'

// Relavant system files
const Files = {
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

// Board identity comes from /run/ctt/board.env — ctt-board-detect's authoritative
// runtime output, regenerated every boot (the services are ordered After it).
// Fall back to the persistent /etc/ctt/station-* files (written-but-normally-
// unread) if board.env is somehow missing.
const BoardEnvFile = '/run/ctt/board.env'

const parseBoardEnv = () => {
  const env = {}
  try {
    fs.readFileSync(BoardEnvFile, 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2]
    })
  } catch (err) {
    // board.env absent — fall through to the /etc fallback below
  }
  return env
}

const fileFallback = (path) => {
  try { return fs.readFileSync(path).toString().trim() } catch (err) { return undefined }
}

// parse station id / version / revision once (board.env, else /etc)
const BoardEnv = parseBoardEnv()
const Id = BoardEnv.CTT_STATION_ID ?? fileFallback(StationFiles.Id)
const Version = parseInt(BoardEnv.CTT_STATION_VERSION ?? fileFallback(StationFiles.Version))
const Revision = parseInt(BoardEnv.CTT_STATION_REVISION ?? fileFallback(StationFiles.Revision))
// const id_interface = new StationIdInterface()
// const {
//   version: Version,
//   revision: Revision,
//   id: Id,
// } = await id_interface.getHardwareInfo()
// console.log('system station id:', Id)
// parse station image date
const Image = new Date(fs.readFileSync(StationFiles.Image).toString())

// parse boot count
const BootCount = parseInt(fs.readFileSync(StationFiles.Bootcount))

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
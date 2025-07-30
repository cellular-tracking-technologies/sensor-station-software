import InitializeExpander from './io-expander/initialize.js'
import StationIdInterface from './id-driver/station-id-interface.js'
import StationFiles from '../station-files.js'
import fs from 'fs'

/**
 * Script to intialize a sensor station
 * V3+ stations have an IO expander that needs to be initialized upon boot
 */
const run = async () => {
  const id_interface = new StationIdInterface()
  // check for the IO expander
  const io_expander_exists = await id_interface.ioExpanderExists()
  if (io_expander_exists) {
    // I2C device found at the IO Expander address - initialize it
    await InitializeExpander()
  }
  const hardware_info = await id_interface.getHardwareInfo()
  const { version, id, revision } = hardware_info
  console.log('revision', revision)
  console.log('version', version)
  fs.writeFileSync(StationFiles.Id, id.trim())
  fs.writeFileSync(StationFiles.Version, version.toString())
  fs.writeFileSync(StationFiles.Revision, revision.toString())
}

run()
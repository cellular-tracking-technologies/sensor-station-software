import At24Mac602Utils from './at24mac602.js'
import { getDeviceId } from './serial-chip.js'
import GetVersion from './version.js'
import I2cScanner from '../i2c/scan.js'

const test_id = async function() {
  const old_id = await getDeviceId()
  console.log('id', old_id)

  const id = await At24Mac602Utils.ReadEUI64()
  console.log('GOT ID', id)

  const id_128 = await At24Mac602Utils.ReadEUI128()
  console.log('128', id_128)
}

const test_version = async () => {
  console.log('testing version')
  const version = await GetVersion()
  console.log('VERSION:', version)
}

const run = async () => {
  await test_id()
  console.log('about to test version')
  await test_version()
  console.log('scanning i2c')
  const addresses = await I2cScanner(1) 
  console.log('addresses', addresses)
}

run()
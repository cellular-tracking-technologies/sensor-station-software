import Tmp411 from './tmp411.js'
import System from '../../../system.js'

const c_to_f = (c) => {
	return c * 9 / 5 + 32
}

const run = async () => {
	const id = System.Hardware.Id
	const sensor = new Tmp411()
	const temperature = await sensor.readLocalTemperature()
	console.log(`Temperature: ${temperature.celsius}C ${temperature.fahrenheit}F, station id: ${id}`)
	process.exit(0)
}

await run()

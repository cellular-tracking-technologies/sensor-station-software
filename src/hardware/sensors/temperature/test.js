import Tmp411 from './tmp411.js'

const c_to_f = (c) => {
  return c * 9 / 5 + 32
}

const run = async () => {
	const sensor = new Tmp411()
	const temperature = await sensor.readLocalTemperature()
  console.log(`Temperature: ${temperature}C ${c_to_f(temperature)}F`)
	process.exit(0)
}

run()

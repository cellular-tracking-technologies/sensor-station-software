import System from './system.js'
import SensorMonitorV3 from './hardware/sensors/v3-driver.js'

const num_array = Array.from({ length: 100000 }, (_, i) => i)

let array = new Set()
// let monitor = new SensorMonitorV3
// monitor.start(5000)

// const run = async () => {
//     for await (const num of num_array) {
//         monitor.read()
//         array.add(System.Hardware.Id)
//         console.log('array', array)

//     }
//     return array
// }

// await run()
// const promise_array = await run()
// console.log(promise_array)
// Promise.all(promise_array)

const promise_array = new Promise((resolve, reject) => {

})

Promise.all(array).then((result) => console.log('result', result))
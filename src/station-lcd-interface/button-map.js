import Revision from '../revision.js'
import { KernelVersion } from '../hardware/kernel/kernel.js'

let kernel = new KernelVersion()
let kernel_pins = kernel.getPins()
console.log('kernel pins', kernel_pins)
// let kernel_version = kernel.kernel_version
// let kernel_image = kernel.getImage()

// console.log('button map kernel version', kernel_version)
// console.log('button map kernel image', kernel_image)

let Buttons = {}
// if (kernel_image === 'bookworm') {

if (Revision.revision >= 3) {
	let { v3: { Buttons: { Up, Down, Select, Back, } } } = kernel_pins
	console.log('destructured pins v3', Up, Down, Select, Back)

	Buttons = {
		Up,
		Down,
		Select,
		Back,
	}
	// Buttons = {
	// 	Up: 529,
	// 	Down: 534,
	// 	Select: 539,
	// 	Back: 520,
	// }
} else {
	let { v2: { Buttons: { Up, Down, Select, Back, } } } = kernel_pins
	console.log('destructured pins v2', Up, Down, Select, Back)
	Buttons = {
		Up,
		Down,
		Select,
		Back,
	}
}
// } else if (kernel_image === 'bullseye') {
// if (Revision.revision >= 3) {
// 	Buttons = {
// 		Up: 17,
// 		Down: 22,
// 		Select: 27,
// 		Back: 8
// 	}
// } else {
// 	Buttons = {
// 		Up: 4,
// 		Down: 5,
// 		Select: 6,
// 		Back: 7

// 	}
// }
// }

export default Buttons

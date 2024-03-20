import Revision from '../revision.js'
import kernel_pins from '../hardware/kernel/kernel.js'

let Buttons = {}

if (Revision.revision >= 3) {
	let { v3: { Buttons: { Up, Down, Select, Back, } } } = kernel_pins
	console.log('destructured pins v3', Up, Down, Select, Back)

	Buttons = {
		Up,
		Down,
		Select,
		Back,
	}

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


export default Buttons

import Revision from '../revision.js'
import KernelInfo from '../hardware/kernel/kernel.js'
const kernel_pins = KernelInfo.getPins()
// import kernel_pins from '../hardware/kernel/kernel.js'

let Buttons = {}

if (Revision.revision >= 3) {
	let { v3: { Buttons: { Up, Down, Select, Back, } } } = kernel_pins

	Buttons = {
		Up,
		Down,
		Select,
		Back,
	}

} else {
	let { v2: { Buttons: { Up, Down, Select, Back, } } } = kernel_pins
	Buttons = {
		Up,
		Down,
		Select,
		Back,
	}
}


export default Buttons

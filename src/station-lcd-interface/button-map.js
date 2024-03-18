import Revision from '../revision.js'
import { KernelVersion } from '../hardware/kernel/kernel.js'

let kernel = new KernelVersion()
let kernel_version = kernel.getVersion()
console.log('kernel version', kernel_version)

let Buttons = {}
if (kernel_version === '6.6.20') {

	if (Revision.revision >= 3) {
		Buttons = {
			Up: 529,
			Down: 534,
			Select: 539,
			Back: 520,
		}
	} else {
		Buttons = {
			Up: 516,
			Down: 517,
			Select: 518,
			Back: 519,
		}
	}
} else {
	if (Revision.revision >= 3) {
		Buttons = {
			Up: 17,
			Down: 22,
			Select: 27,
			Back: 8

		}
	} else {
		Buttons = {
			Up: 4,
			Down: 5,
			Select: 6,
			Back: 7

		}
	}
}

export default Buttons

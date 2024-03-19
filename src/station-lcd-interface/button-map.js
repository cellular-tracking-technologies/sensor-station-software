import Revision from '../revision.js'
import { KernelVersion } from '../hardware/kernel/kernel.js'
import { execSync } from 'child_process'

let kernel = new KernelVersion()
let kernel_version = kernel.kernel_version
let kernel_image = kernel.getImage()

console.log('button map kernel version', kernel_version)
console.log('button map kernel image', kernel_image)
let Buttons = {}
if (kernel_version === 'bookworm') {

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
} else if (kernel_image === 'bullseye') {
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

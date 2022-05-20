import Revision from '../revision.js'

let Buttons = {}

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

export default Buttons

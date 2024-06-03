import Revision from '../../revision.js'
const Pins = {
    V3: {
        Buttons: {
            Up: 529,
            Down: 534,
            Select: 539,
            Back: 520,
        },
        GPS: 512,
        A: 522,
        B: 523,
    },
    V2: {
        Buttons: {
            Up: 516,
            Down: 517,
            Select: 518,
            Back: 519,
        },
        GPS: 550,
        A: 551,
        B: 552,
    },
    reset_pin: 531,
}

export default (Revision.revision >= 3) ? Pins.V3 : Pins.V2
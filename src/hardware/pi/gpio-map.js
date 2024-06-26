import System from '../../system.js'
import OsInfo from './os.js'

const { Revision } = System

const BookwormPins = {
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

const BullseyePins = {
    V3: {
        Buttons: {
            Up: 17,
            Down: 22,
            Select: 27,
            Back: 8
        },
        GPS: 0,
        A: 10,
        B: 11,
    },
    V2: {
        Buttons: {
            Up: 4,
            Down: 5,
            Select: 6,
            Back: 7
        },
        GPS: 38,
        A: 39,
        B: 40,
    },
    reset_pin: 19,
}

// Identify which debian version we are running - GPIO numbers changed in Bookworm 
const Pins = (OsInfo.Release > 11) ? BookwormPins : BullseyePins

// Identify which Station Hardware revision we are using
export default (Revision >= 3) ? Pins.V3 : Pins.V2
// import display from './display-driver'

const wifi = {
    block_left: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x07, 0x08, 0x10, 0x07, 0x08, 0x03, 0x04, 0x01], 'hex')),
            med: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x07, 0x08, 0x03, 0x04, 0x01], 'hex')),
            low: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x04, 0x01], 'hex')),
        },
        char: 0,
        hex: `\x00`,
    },
    block_right: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x1C, 0x02, 0x01, 0x1C, 0x02, 0x18, 0x04, 0x10], 'hex')),
            med: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x1C, 0x02, 0x18, 0x04, 0x10], 'hex')),
            low: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x04, 0x10], 'hex'))
        },
        char: 1,
        hex: `\x01`,
    },
    warning: {
        byte: null,
        char: null,
        hex: `\x21`,
    },
}


const battery = {

    top: {
        byte: Uint8Array.from(Buffer.from([0x00, 0x00, 0x18, 0x18, 0x18, 0x18, 0x00, 0x00], 'hex')),
        char: 2,
        hex: `\x02`,
    },
    empty_bar: {
        byte: Uint8Array.from(Buffer.from([0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f], 'hex')),
        char: 3,
        hex: `\x03`,
    },
    full_bar: {
        byte: null,
        char: null,
        hex: `\xff`,
    },
    warning: {
        byte: null,
        char: null,
        hex: `\x21`,
    },
    power: {
        byte: Uint8Array.from(Buffer.from([0x00, 0x04, 0x0E, 0x15, 0x15, 0x11, 0x11, 0x0E], 'hex')),
        char: 3,
        hex: `\x03`,
    }
}

const solar = {
    block_left: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x11, 0x0b, 0x07, 0x07, 0x1f, 0x07, 0x0b, 0x11], 'hex')),
            med: Uint8Array.from(Buffer.from([0x11, 0x0b, 0x04, 0x04, 0x1f, 0x07, 0x0b, 0x11], 'hex')),
            low: Uint8Array.from(Buffer.from([0x11, 0x0b, 0x04, 0x04, 0x1c, 0x04, 0x0b, 0x11], 'hex')),
        },
        char: 4,
        hex: `\x04`,
    },
    block_right: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x11, 0x1a, 0x1c, 0x1c, 0x1f, 0x1c, 0x1a, 0x11], 'hex')),
            med: Uint8Array.from(Buffer.from([0x11, 0x1a, 0x04, 0x04, 0x1f, 0x1c, 0x1a, 0x11], 'hex')),
            low: Uint8Array.from(Buffer.from([0x11, 0x1a, 0x04, 0x04, 0x07, 0x04, 0x1a, 0x11], 'hex')),
        },
        char: 5,
        hex: `\x05`,
    },
    sun: {
        byte: Uint8Array.from(Buffer.from([0x00, 0x04, 0x15, 0x0E, 0x1F, 0x0E, 0x15, 0x04], 'hex')),
        char: 5,
        hex: `\x05`,
    }
}

const cell = {
    block_left: {
        byte: {
            low: Uint8Array.from(Buffer.from([0x1F, 0x0E, 0x04, 0x04, 0x04, 0x04, 0x05, 0x05], 'hex')),
        },
        char: 6,
        hex: `\x06`,
    },
    block_right: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x01, 0x01, 0x01, 0x01, 0x09, 0x09, 0x09, 0x09], 'hex')),
            med: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x08, 0x08, 0x08, 0x08], 'hex')),
        },
        char: 7,
        hex: `\x07`,
    },
    warning: {
        byte: null,
        char: null,
        hex: `\x21`,
    }
}

const temp = {
    degree: {
        byte: null,
        char: null,
        hex: `\xdf`,
    },
    warning: {
        byte: null,
        char: null,
        hex: `\x21`,
    }
}

const thresholds = {
    wifi: {
        max: 75,
        med: 50,
        min: 25,
    },
    battery: {
        max: 11.75,
        min: 11.3,
    },
    cell: {
        max: 75,
        med: 50,
        min: 25,
    },

    solar: {
        max: 0.03,
        min: 0.02,
    },
}

export { wifi, battery, cell, temp, solar, thresholds }


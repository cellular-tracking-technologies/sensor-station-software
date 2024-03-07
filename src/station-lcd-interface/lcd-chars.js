// import display from './display-driver'

const wifi = {
    block_left: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x00, 0x03, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00], 'hex')),
            med: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00], 'hex')),
        },
        char: 0,
        hex: `\x00`,
    },
    block_center: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x1f, 0x00, 0x00, 0x1f, 0x00, 0x0e, 0x11, 0x04], 'hex')),
            med: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x1f, 0x00, 0x0e, 0x11, 0x04], 'hex')),
        },
        char: 1,
        hex: `\x01`,
    },
    block_right: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x00, 0x18, 0x04, 0x00, 0x10, 0x00, 0x00, 0x00], 'hex')),
            med: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00], 'hex')),
        },
        char: 2,
        hex: `\x02`,
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
        char: 3,
        hex: `\x03`,
    },
    empty_bar: {
        byte: Uint8Array.from(Buffer.from([0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f], 'hex')),
        char: 4,
        hex: `\x04`,
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
}

const solar = {
    block_left: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x00, 0x00, 0x01, 0x11, 0x0b, 0x07, 0x07, 0x1f], 'hex')),
            med: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x01, 0x0b, 0x07, 0x07, 0x0f], 'hex')),
            low: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x03, 0x07, 0x07, 0x07], 'hex')),
        },
        char: 5,
        hex: `\x05`,
    },
    block_right: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x00, 0x00, 0x10, 0x11, 0x1a, 0x1c, 0x1c, 0x1f], 'hex')),
            med: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x10, 0x1a, 0x1c, 0x1c, 0x1e], 'hex')),
            low: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x18, 0x1c, 0x1c, 0x1c], 'hex')),
        },
        char: 6,
        hex: `\x06`,
    },
    sun: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x0E, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x0E], 'hex')),
            med: Uint8Array.from(Buffer.from([0x0E, 0x11, 0x11, 0x11, 0x1F, 0x1F, 0x1F, 0x0E], 'hex')),
            low: Uint8Array.from(Buffer.from([0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], 'hex')),
        },
        char:5,
        hex: `\x05`,
    }
}

const cell = {
    left: {
        byte: null,
        char: null,
        hex: '\x28',
    },

    center: {
        byte: null,
        char: null,
        hex: `\x2a`,
    },

    right: {
        byte: null,
        char: null,
        hex: `\x29`,
    },
    bottom: {
        byte: null,
        char: null,
        hex: `\x7c`,
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
        max: -90,
        med: -105,
        min: -113,
    },

    solar: {
        max: 0.03,
        min: 0.02,
    },
}

export { wifi, battery, cell, temp, solar, thresholds }


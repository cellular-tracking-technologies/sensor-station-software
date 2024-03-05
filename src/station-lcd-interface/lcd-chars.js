// import display from './display-driver'

const wifi = {
    block_left: {
        byte: {
            high: Uint8Array.from(Buffer.from([0x00, 0x03, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00], 'hex')),
            med: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00], 'hex')),
        },
        char: 5,
        hex: `\x05`

    }
}


const bytes = {
    wifi: {
        high: {
            block_left: Uint8Array.from(Buffer.from([0x00, 0x03, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00], 'hex')),
            block_center: Uint8Array.from(Buffer.from([0x1f, 0x00, 0x00, 0x1f, 0x00, 0x0e, 0x11, 0x04], 'hex')),
            block_right: Uint8Array.from(Buffer.from([0x00, 0x18, 0x04, 0x00, 0x10, 0x00, 0x00, 0x00], 'hex')),
        },
        med: {
            block_left: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00], 'hex')),
            block_center: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x1f, 0x00, 0x0e, 0x11, 0x04], 'hex')),
            block_right: Uint8Array.from(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00], 'hex')),
        }
    },
    battery: {
        top: Uint8Array.from(Buffer.from([0x00, 0x00, 0x18, 0x18, 0x18, 0x18, 0x00, 0x00], 'hex')),
        empty_bar: Uint8Array.from(Buffer.from([0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f], 'hex')),
    }
}


const chars = {
    wifi: {
        char: {
            block_left: 5,
            block_center: 6,
            block_right: 7,
        },
        hex: {
            block_left: `\x05`,
            block_center: `\x06`,
            block_right: `\x07`,
        },
    },
    battery: {
        char: {
            top: 1,
            empty_bar: 2,
        },
        hex: {
            top: `\x01`,
            empty_bar: `\x02`,
        }
    },



}

export { bytes, chars }
// export default Object.freeze({

//     cell: {
//         off: 0,
//         on: 1,
//         blink: 2
//     },
//     battery: {
//         forever: -1,
//         config: 3,
//     },
//     temperature: [

//     ]
// })

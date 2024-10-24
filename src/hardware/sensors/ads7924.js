//const Gpio = require('onoff').Gpio
import { Gpio } from 'onoff'
import i2c from 'i2c-bus'
import GpioMap from '../pi/gpio-map.js'

class Ads7924 {
    constructor(i2c_port = 1, address = 0x48, reset_pin = GpioMap.ResetPin) {
        this.i2cPort_ = i2c_port
        this.address_ = address
        console.log('RESET PIN', reset_pin)
        this.reset_ = new Gpio(reset_pin, 'out')
        this.i2c_
    }

    init() {
        this.reset_.writeSync(1, err => {
            if (err) {
                throw err
            }
        })
        this.i2c_ = i2c.open(this.i2cPort_, (err) => {
            if (err) {
                console.log('Unable to open I2C port on device ' + this.i2cPort_ + ' ERROR: ' + err)
                console.log(this)
                throw (err)
            }
        })
    }
    read() {
        this.i2c_.writeByteSync(this.address_, 0x15, 0x80) // PWRCONFIG
        this.i2c_.writeByteSync(this.address_, 0x00, 0xCC) // MODECNTRL
        this.i2c_.writeByteSync(this.address_, 0x14, 0x1F) // ACQCONFIG

        let regs = []
        for (let reg = 0; reg < 0x16; reg++) {
            let value = this.i2c_.readByteSync(this.address_, reg)
            regs.push(value)
        }

        return [
            ((regs[2] << 4) | (regs[3] >> 4)), // * (5.016 / 4096) * 6,
            ((regs[4] << 4) | (regs[5] >> 4)), // * (5.016 / 4096) * 6,
            ((regs[6] << 4) | (regs[7] >> 4))  // * (5.016 / 4096)
        ]
    }
}

export default Ads7924
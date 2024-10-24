import i2c from 'i2c-bus'

class Tmp102 {
    constructor(i2c_port = 1, address = 0x49) {
        this.i2cPort_ = i2c_port
        this.address = address
    }
    init() {
        this.i2c_ = i2c.open(this.i2cPort_, (err) => {
            if (err) {
                console.log('Unable to open I2C port on device ' + this.i2cPort_ + ' ERROR: ' + err)
                console.log(this)
                throw (err)
            }
        })
    }
    read() {

        const reg0 =this.i2c_.readByteSync(this.address, 0)
        const reg1 =this.i2c_.readByteSync(this.address, 1)

        let digitalTemp = 0

        // Bit 0 of second byte will always be 0 in 12-bit readings and 1 in 13-bit
        if (reg1 & 0x01)  // 13 bit mode
        {
            // Combine bytes to create a signed int
            digitalTemp = ((reg0) << 5) | (reg1 >> 3)
            // Temperature data can be + or -, if it should be negative,
            // convert 13 bit to 16 bit and use the 2s compliment.
            if (digitalTemp > 0xFFF) {
                digitalTemp |= 0xE000
            }
        }
        else  // 12 bit mode
        {
            // Combine bytes to create a signed int 
            digitalTemp = ((reg0) << 4) | (reg1 >> 4)
            // Temperature data can be + or -, if it should be negative,
            // convert 12 bit to 16 bit and use the 2s compliment.
            if (digitalTemp > 0x7FF) {
                digitalTemp |= 0xF000
            }
        }
        // Convert digital reading to analog temperature (1-bit is equal to 0.0625 C)
        return digitalTemp * 0.0625

        // const msb = word & 0x00ff
        // const lsb = (word & 0xff00) >> 8

        // return (((msb * 256) + lsb) >> 4) * 0.0625
    }
}
export default Tmp102
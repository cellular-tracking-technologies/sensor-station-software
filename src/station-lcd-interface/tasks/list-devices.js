import fetch from 'node-fetch'
import url from 'url'

class ListDevices {
    constructor(base_url) {
        this.url = url.resolve(base_url, 'list-devices')
        this.header = 'List Devices'
    }
    loading() {
        return [this.header, 'Getting devices...']
    }
    results() {
        return new Promise((resolve, reject) => {
            fetch(this.url)
                .then(data => {

                    return data.json()
                })
                .then(res => {
                    const { usb_devices, usb_ports, i2c_devices } = res
                    resolve([this.header, `Usb Devices: ${usb_devices}`, `Usb Ports: ${usb_ports}`, `I2C: ${i2c_devices}`])
                })
                .catch(error => {
                    resolve([this.header, 'error'])
                })
        })
    }
}

export { ListDevices }
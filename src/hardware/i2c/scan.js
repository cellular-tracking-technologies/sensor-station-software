import i2c from 'i2c-bus'

/**
 * scan i2c bus
 * @param {Number} bus_id bus to open [1 or 2]
 * @returns {Promise}
 */
export default async (bus_id) => {
  const bus = await i2c.openPromisified(bus_id)
  return new Promise((resolve, reject) => {
    bus.scan((err, addresses) => {
      if (err) return reject(err)
      bus.close().then(() => {
        resolve(addresses)
      })
    })
  })
}

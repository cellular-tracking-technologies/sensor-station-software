import { execSync } from 'child_process'
import icmp from 'icmp'

const PingInfo = {
  DefaultCount: 3,
  DefaultIp: '8.8.8.8',
}

const ping = async (ip) => {
  return new Promise((resolve) => {
    icmp.send(ip).then((ping_result) => {
      resolve(ping_result.open)
    })
  })
}

export default Object.freeze({
  /**
   * 
   * @param {Object} opts 
   * @param {Integer} opts.ping_count
   * @param {String} opts.ip
   * @returns {Object}
   */
  Ping: async (opts) => {
    const {
      ping_count: input_ping_count,
      ip,
    } = opts
    const ping_count = input_ping_count ? input_ping_count : PingInfo.DefaultCount
    const promises = []
    for (let i = 0; i < ping_count; i++) {
      promises.push(ping(ip ? ip : PingInfo.DefaultIp))
    }
    const ping_results = await Promise.all(promises)
    const results = {
      success: 0,
      fail: 0,
    }
    ping_results.forEach((result) => {
      result ? results.success++ : results.fail++
    })
    return results
  },
  /**
   * 
   * @returns {String}
   */
  Gateway: () => {
    const gateway = execSync("ip route | grep default | awk '{ print $3 }' | xargs").toString().trim()
    return { gateway }
  }
})

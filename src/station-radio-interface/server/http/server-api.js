import fetch from 'node-fetch'
import moment from 'moment'

/**
 * Server API for the health checkin.
 *
 * The resilience properties here are deliberately modelled on
 * src/station-utils/uploader.py, which reaches the server reliably over the
 * same cellular link that the checkin used to fail on:
 *
 *   uploader.py                          | here
 *   -------------------------------------|--------------------------------
 *   TIMEOUT = 20                         | remote_timeout_ms
 *   MAX_ATTEMPTS = 3                     | max_attempts
 *   checkInternetStatus() -> HTTPS 200   | checkServerReachable()
 *   post() retries on exception          | post() retries on exception + 5xx
 *
 * Note on timeouts: node-fetch 3.x removed the `timeout` option, so the
 * `// timeout: 5000` that used to sit in the POST options had no effect even
 * before it was commented out. Every request now goes through
 * fetchWithTimeout(), which enforces it with an AbortController.
 */
class ServerApi {
  constructor() {
    this.endpoint = "https://station.internetofwildlife.com/station/v2/checkin/"
    // same host and scheme uploader.py probes with checkInternetStatus()
    this.status_endpoint = "https://station.internetofwildlife.com/status"
    this.hardware_endpoint = "http://localhost:3000/"
    this.details = [
      'modem',
      'sensor/details',
      //'peripherals',
      'gps',
      'about',
      'internet/pending-upload',
      'node/version',
      'revision',
    ]
    this.sensor_data = []
    this.max_sensor_records = 100
    // uploader.py: TIMEOUT = 20 (seconds), applied to the upload POST
    this.remote_timeout_ms = 20 * 1000
    // the hardware server is on loopback; it should never need 20s
    this.hardware_timeout_ms = 5 * 1000
    // uploader.py: MAX_ATTEMPTS = 3
    this.max_attempts = 3
    this.retry_delay_ms = 2 * 1000
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * fetch with a hard deadline. node-fetch 3.x has no timeout option, so an
   * unanswered request on a stalled cellular link would otherwise hang the
   * checkin forever -- the station would then wait for the next heartbeat
   * (checkin_frequency_minutes, 360 by default) before trying again.
   */
  async fetchWithTimeout(url, options = {}, timeout_ms) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout_ms)
    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  pollSensors() {
    let uri = `${this.hardware_endpoint}sensor/details`
    this.fetchWithTimeout(uri, {}, this.hardware_timeout_ms).then(res => res.json())
      .then((data) => {
        let now = moment()
        data.received_at = now.toISOString()
        this.sensor_data.push(data)
        if (this.sensor_data.length > this.max_sensor_records) {
          // only store up to a maximum number of sensor records
          this.sensor_data.shift()
        }
      })
      .catch((err) => {
        console.error('error polling sensor details', err.toString())
      })
  }

  filterStats(stats) {
    Object.keys(stats.channels).forEach((channel) => {
      let channel_data = stats.channels[channel]

      Object.keys(channel_data.beeps).forEach((tag) => {
        let cnt = channel_data.beeps[tag]
        if (cnt < 5) {
          delete channel_data.beeps[tag]
        }
      })
      Object.keys(channel_data.nodes.beeps).forEach((tag) => {
        let cnt = channel_data.nodes.beeps[tag]
        if (cnt < 5) {
          delete channel_data.nodes.beeps[tag]
        }
      })
    })
    return stats
  }

  /**
   * ICMP-based check served by the hardware server: 3 echo requests to
   * 8.8.8.8. Kept for callers that want a link-layer signal; it is NOT used to
   * gate the checkin, because cell carriers commonly drop ICMP while passing
   * TCP 443 -- which reports "no internet" on a link that uploads fine.
   * Prefer checkServerReachable() for anything checkin-related.
   */
  checkInternet() {
    return this.fetchWithTimeout(`${this.hardware_endpoint}internet/status`, {}, this.hardware_timeout_ms)
      .then(res => res.json())
      .then(json => json.success == 3)
      .catch((err) => {
        console.error('error checking internet status', err.toString())
        return false
      })
  }

  /**
   * Reachability check ported from uploader.py's checkInternetStatus(): a real
   * HTTPS GET against the host that is about to receive the checkin. Same
   * transport, same DNS, same TLS as the POST, so it agrees with the uploader
   * about whether the server is reachable.
   *
   * Used for diagnosis only -- it never blocks the checkin. uploader.py gates a
   * loop over many files on this, where skipping is cheap; a checkin is a single
   * POST that carries its own retries, so refusing to send can only lose data.
   */
  async checkServerReachable() {
    try {
      const res = await this.fetchWithTimeout(this.status_endpoint, {}, this.remote_timeout_ms)
      return res.status === 200
    } catch (err) {
      console.error(`server status check failed: ${err.toString()}`)
      return false
    }
  }

  /**
   * Clean GPS data from aggregated qaqc report information
   * @param {*} data 
   */
  cleanGps(data) {
    let gps = {
      lat: null,
      lng: null,
      time: null
    }
    if (data.gps) {
      if (data.gps.gps) {
        gps.lat = data.gps.gps.lat
        gps.lng = data.gps.gps.lon
        gps.time = data.gps.gps.time
      }
    }
    return gps
  }

  /**
   * Build the modem block for the server check-in.
   *
   * The hardware server reports `signal` as a 0-100 percentage and the dBm
   * reading separately as `rssi`. The check-in API parses `signal` with
   * int(signal_str.split(',')[0]) and renders the result as dBm, so an
   * integer percentage both fails that parse and carries the wrong units.
   * Send the dBm reading as a string in `signal`; every other field --
   * including `rssi` and the `imei`/`sim` the server keys the modem record
   * on -- is passed through untouched.
   *
   * collectDetails() reports a failed fragment as null, and a disabled modem
   * makes /modem answer with a literal null, so the falsy guard covers both.
   * @param {Object|null} modem response from the hardware server /modem route
   * @returns {Object|null}
   */
  modemCheckinInfo(modem) {
    if (!modem) return modem
    let dbm = parseInt(modem.rssi)
    if (isNaN(dbm)) return modem
    return Object.assign({}, modem, { signal: dbm.toString() })
  }

  /**
   * Poll the hardware server for the payload fragments.
   *
   * allSettled, not all: uploader.py has no local dependencies at all, whereas
   * Promise.all meant a single unhappy loopback endpoint (a modem route
   * returning 500, a /pending-upload glob crawling a large backlog) aborted the
   * entire checkin. A failed fragment is now reported as null and the checkin
   * still goes out.
   */
  async collectDetails() {
    const results = await Promise.allSettled(
      this.details.map((post) => this.fetchWithTimeout(
        `${this.hardware_endpoint}${post}`, {}, this.hardware_timeout_ms
      ).then(res => res.json()))
    )
    return results.map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      console.error(`failed to fetch ${this.details[i]}: ${result.reason}`)
      return null
    })
  }

  /**
   * POST the payload, mirroring uploader.py's post(): a bounded attempt count
   * with a request timeout on every try.
   *
   * Retries transport errors (timeout, DNS, refused, reset) like the uploader
   * does, and additionally retries 5xx -- a checkin lost to a transient server
   * error otherwise waits out a full heartbeat interval. 4xx is not retried:
   * the server has looked at the payload and refused it, so re-sending the same
   * bytes cannot succeed.
   *
   * Unlike uploader.py the attempt counter is local rather than an instance
   * field. In the python version self.attempt is only reset on success, so a
   * file that exhausts its retries leaves the next file with none.
   *
   * @returns {Boolean} true once the server accepts the payload
   */
  async post(data) {
    const body = JSON.stringify(data)
    let last_error = null

    for (let attempt = 1; attempt <= this.max_attempts; attempt++) {
      try {
        const res = await this.fetchWithTimeout(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
        }, this.remote_timeout_ms)

        if (res.ok) {
          console.log(`checkin accepted (${res.status}) on attempt ${attempt} of ${this.max_attempts}`)
          return true
        }

        const text = await res.text().catch(() => '')
        console.error(`checkin rejected: ${res.status} ${res.statusText} - ${text}`)
        if (res.status < 500) {
          return false
        }
        last_error = `HTTP ${res.status} ${res.statusText}`
      } catch (err) {
        last_error = err.toString()
        console.error(`checkin attempt ${attempt} of ${this.max_attempts} failed: ${last_error}`)
      }

      if (attempt < this.max_attempts) {
        await this.sleep(this.retry_delay_ms)
      }
    }

    console.error(`checkin failed after ${this.max_attempts} attempts: ${last_error}`)
    return false
  }

  /**
   * Collect the station's health payload and deliver it to the server.
   * @returns {Boolean} true if the server accepted the checkin
   */
  async healthCheckin(stats, radio_fw, blu_stats, blu_fw) {
    const responses = await this.collectDetails()

    const data = {
      'modem': this.modemCheckinInfo(responses[0]),
      //'peripherals': responses[2],
      'gps': responses[2],
      'about': responses[3],
      'uploads': responses[4],
      'software': responses[5],
      'revision': responses[6],
      'radio': radio_fw,
      'blu': blu_fw
    }

    data.gps = this.cleanGps(data)
    data.sensor = this.sensor_data
    data.blu_stats = blu_stats
    try {
      data.stats = this.filterStats(stats)
    } catch (err) {
      // a malformed stats document must not cost us the whole checkin
      console.error('error filtering stats, sending unfiltered', err.toString())
      data.stats = stats
    }

    // logged, never gating -- see checkServerReachable()
    const reachable = await this.checkServerReachable()
    if (!reachable) {
      console.error('server status check did not return 200 - attempting checkin anyway')
    }

    const accepted = await this.post(data)
    if (accepted) {
      // we have a successful server checkin - clear sensor data
      this.sensor_data = []
    }
    return accepted
  }
}

export { ServerApi }

import fetch from 'node-fetch'

class LedDriver {
  constructor(opts) {
    this.leds = [
      'a',
      'b',
      'gps'
    ]
    // A literal address, never a hostname. station-hardware-server binds
    // 127.0.0.1 only, and once the box has no non-loopback IPv4 left, glibc's
    // AI_ADDRCONFIG drops the v4 answer entirely and leaves ::1 — which nothing
    // listens on. Dialing the address removes the resolver from the path.
    this.endpoint = 'http://127.0.0.1:3000/led'
  }

  async post(opts) {
    return fetch(opts.uri, {
      method: 'POST',
      body: opts.payload,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  async toggleLight(opts) {
    if (this.leds.includes(opts.led)) {
      let uri
      if (opts.led == 'gps') {
        uri = `${this.endpoint}/${opts.led}`
      } else {
        uri = `${this.endpoint}/diag/${opts.led}`
      }
      let payload = {
        state: opts.state
      }
      if (opts.blink_ms) {
        payload.blink_ms = opts.blink_ms
      }
      return this.post({
        uri: uri,
        payload: JSON.stringify(payload)
      })
    }
    return Promise.reject(`invalid led option ${opts.led}`)
  }

  async toggleDiagA(opts) {
    return this.toggleLight({
      led: 'a',
      state: opts.state,
      blink_ms: opts.blink_ms ? opts.blink_ms : null
    })
  }

  async toggleDiagB(opts) {
    return this.toggleLight({
      led: 'b',
      state: opts.state,
      blink_ms: opts.blink_ms ? opts.blink_ms : null
    })
  }

  async toggleGps(opts) {
    return this.toggleLight({
      led: 'gps',
      state: opts.state,
      blink_ms: opts.blink_ms ? opts.blink_ms : null
    })
  }

}

export { LedDriver }
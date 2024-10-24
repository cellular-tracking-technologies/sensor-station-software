import fetch from 'node-fetch'

class LedDriver {
  constructor(opts) {
    this.leds = [
      'a',
      'b',
      'gps'
    ]
    this.endpoint = 'http://localhost:3000/led'
  }

  post(opts) {
    return fetch(opts.uri, {
      method: 'POST',
      body: opts.payload,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  toggleLight(opts) {
    if (this.leds.includes(opts.led)) {
      let uri
      if (opts.led == 'gps') {
        uri = `${this.endpoint}/${opts.led}`
      } else {
        uri = `${this.endpoint}/diag/${opts.led}`
      }
      console.log('toggle', uri)
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

  toggleDiagA(opts) {
    return this.toggleLight({
      led: 'a',
      state: opts.state,
      blink_ms: opts.blink_ms ? opts.blink_ms : null
    })
  }

  toggleDiagB(opts) {
    return this.toggleLight({
      led: 'b',
      state: opts.state,
      blink_ms: opts.blink_ms ? opts.blink_ms : null
    })
  }

  toggleGps(opts) {
    return this.toggleLight({
      led: 'gps',
      state: opts.state,
      blink_ms: opts.blink_ms ? opts.blink_ms : null
    })
  }

}

export { LedDriver }
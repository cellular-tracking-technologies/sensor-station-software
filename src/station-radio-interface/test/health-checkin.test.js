/**
 * Health-checkin tests.
 *
 * Verifies that healthCheckin has the delivery properties of
 * src/station-utils/uploader.py: a request timeout, a bounded retry, and no
 * dependence on the hardware server succeeding.
 *
 *   npm test
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { ServerApi } from '../server/http/server-api.js'

/** stats document shaped the way filterStats() expects */
const makeStats = () => ({
  channels: {
    1: { beeps: { AAAA1111: 9, BBBB2222: 2 }, nodes: { beeps: { CCCC3333: 7 } } },
  },
})

/** hardware server covering every loopback endpoint the checkin polls */
const startHardware = (opts = {}) => {
  const { failEndpoint = null, hangEndpoint = null } = opts
  const bodies = {
    'modem': { imei: '000000000000000', sim: '0000' },
    'sensor/details': { voltages: { battery: 4.0, rtc: 3.0, solar: 5.0 } },
    'gps': { gps: { lat: 1, lon: 2, time: '2026-07-31T00:00:00Z' } },
    'about': { station_image: '2026-07-31', station_software: '2026-07-31' },
    'internet/pending-upload': { ctt: { bytes: 0, file_count: 0 } },
    'node/version': { version: '2.3.4' },
    'revision': { version: 3, revision: 3 },
    'internet/status': { success: 3, fail: 0 },
  }
  const server = http.createServer((req, res) => {
    const route = req.url.replace(/^\//, '')
    if (hangEndpoint && route === hangEndpoint) return
    if (failEndpoint && route === failEndpoint) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'modem not on bus' }))
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(bodies[route] ?? {}))
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)))
}

/**
 * Cloud mock. `checkin` is a list of behaviours consumed one per POST, the last
 * repeating: { status } | { hang: true } | { destroy: true }.
 * `status` is the behaviour for the uploader-style GET /status probe.
 */
const startRemote = (opts = {}) => {
  const { checkin = [{ status: 204 }], status = { status: 200 } } = opts
  const posts = []
  const probes = []
  let i = 0
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      const behaviour = req.method === 'POST'
        ? (checkin[Math.min(i++, checkin.length - 1)])
        : status
      if (req.method === 'POST') posts.push(raw); else probes.push(req.url)
      if (behaviour.destroy) return req.socket.destroy()
      if (behaviour.hang) return
      res.writeHead(behaviour.status)
      res.end(behaviour.body ?? '')
    })
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, posts, probes })))
}

/** ServerApi wired to the mocks, with timings shrunk for the test run */
const apiFor = (hardware, remote) => {
  const api = new ServerApi()
  api.hardware_endpoint = `http://127.0.0.1:${hardware.address().port}/`
  if (remote) {
    const base = `http://127.0.0.1:${remote.address().port}`
    api.endpoint = `${base}/station/v2/checkin/`
    api.status_endpoint = `${base}/status`
  }
  api.hardware_timeout_ms = 300
  api.remote_timeout_ms = 400
  api.retry_delay_ms = 50
  return api
}

const close = (...servers) => Promise.all(
  servers.filter(Boolean).map((s) => new Promise((r) => s.close(r)))
)

// ---------------------------------------------------------------------------
// happy path
// ---------------------------------------------------------------------------

test('a 204 is a success: resolves true, clears the sensor buffer, sends one POST', async () => {
  const hardware = await startHardware()
  const { server: remote, posts, probes } = await startRemote({ checkin: [{ status: 204 }] })
  const api = apiFor(hardware, remote)
  api.sensor_data = [{ received_at: 'x' }]

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), true)
  assert.equal(posts.length, 1, 'no wasted retries on success')
  assert.equal(api.sensor_data.length, 0, 'buffer cleared')
  assert.deepEqual(probes, ['/status'], 'probes the same endpoint uploader.py probes')

  const sent = JSON.parse(posts[0])
  assert.equal(sent.software.version, '2.3.4')
  assert.equal(sent.gps.lat, 1)
  assert.equal(sent.about.station_image, '2026-07-31')
  assert.equal(sent.stats.channels[1].beeps.AAAA1111, 9)
  assert.equal(sent.stats.channels[1].beeps.BBBB2222, undefined, 'sub-5 beeps filtered')
  await close(hardware, remote)
})

// ---------------------------------------------------------------------------
// retry ladder -- the uploader.py behaviour
// ---------------------------------------------------------------------------

test('a transport error is retried and the checkin still lands', async () => {
  const hardware = await startHardware()
  const { server: remote, posts } = await startRemote({
    checkin: [{ destroy: true }, { status: 204 }],
  })
  const api = apiFor(hardware, remote)

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), true)
  assert.equal(posts.length, 2, 'one failure, one success')
  await close(hardware, remote)
})

test('a stalled cloud endpoint is aborted, retried, and bounded (never hangs)', async () => {
  const hardware = await startHardware()
  const { server: remote, posts } = await startRemote({
    checkin: [{ hang: true }, { hang: true }, { status: 204 }],
  })
  const api = apiFor(hardware, remote)
  const started = Date.now()

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), true)
  assert.equal(posts.length, 3)
  const elapsed = Date.now() - started
  assert.ok(elapsed >= 800, `waited out two 400ms deadlines, got ${elapsed}ms`)
  assert.ok(elapsed < 5000, `bounded, got ${elapsed}ms`)
  await close(hardware, remote)
})

test('a 5xx is retried up to max_attempts, then gives up', async () => {
  const hardware = await startHardware()
  const { server: remote, posts } = await startRemote({ checkin: [{ status: 502 }] })
  const api = apiFor(hardware, remote)

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), false)
  assert.equal(posts.length, api.max_attempts, 'exactly 3 attempts, no unbounded loop')
  await close(hardware, remote)
})

test('a transient 5xx followed by a 204 succeeds', async () => {
  const hardware = await startHardware()
  const { server: remote, posts } = await startRemote({
    checkin: [{ status: 503 }, { status: 204 }],
  })
  const api = apiFor(hardware, remote)

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), true)
  assert.equal(posts.length, 2)
  await close(hardware, remote)
})

test('a 4xx is NOT retried and the sensor buffer is retained', async () => {
  const hardware = await startHardware()
  const { server: remote, posts } = await startRemote({
    checkin: [{ status: 404, body: 'not found' }],
  })
  const api = apiFor(hardware, remote)
  api.sensor_data = [{ received_at: 'x' }]

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), false)
  assert.equal(posts.length, 1, 'the server read the payload and refused it')
  assert.equal(api.sensor_data.length, 1, 'sensor records survive to ride the next checkin')
  await close(hardware, remote)
})

test('retries are spaced by retry_delay_ms', async () => {
  const hardware = await startHardware()
  const { server: remote, posts } = await startRemote({ checkin: [{ status: 500 }] })
  const api = apiFor(hardware, remote)
  api.retry_delay_ms = 250
  const started = Date.now()

  await api.healthCheckin(makeStats(), [], {}, [])
  const elapsed = Date.now() - started
  assert.equal(posts.length, 3)
  assert.ok(elapsed >= 500, `two 250ms gaps between three attempts, got ${elapsed}ms`)
  await close(hardware, remote)
})

// ---------------------------------------------------------------------------
// the hardware server must not be able to veto a checkin
// ---------------------------------------------------------------------------

test('a failing loopback endpoint degrades to null instead of aborting the checkin', async () => {
  const hardware = await startHardware({ failEndpoint: 'modem' })
  const { server: remote, posts } = await startRemote()
  const api = apiFor(hardware, remote)

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), true)
  const sent = JSON.parse(posts[0])
  assert.deepEqual(sent.modem, { error: 'modem not on bus' }, 'the 500 body still parses')
  assert.equal(sent.about.station_image, '2026-07-31', 'healthy fragments unaffected')
  await close(hardware, remote)
})

test('a stalled loopback endpoint is dropped, not waited on forever', async () => {
  const hardware = await startHardware({ hangEndpoint: 'internet/pending-upload' })
  const { server: remote, posts } = await startRemote()
  const api = apiFor(hardware, remote)
  const started = Date.now()

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), true)
  assert.equal(JSON.parse(posts[0]).uploads, null, 'reported as null')
  assert.ok(Date.now() - started < 3000, 'bounded by hardware_timeout_ms')
  await close(hardware, remote)
})

test('the entire hardware server being down still produces a checkin', async () => {
  const hardware = await startHardware()
  const { server: remote, posts } = await startRemote()
  const api = apiFor(hardware, remote)
  await close(hardware) // nothing on loopback now

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), true)
  const sent = JSON.parse(posts[0])
  assert.equal(sent.modem, null)
  assert.equal(sent.about, null)
  assert.equal(sent.stats.channels[1].beeps.AAAA1111, 9, 'radio stats still delivered')
  await close(remote)
})

test('a malformed stats document is sent unfiltered rather than losing the checkin', async () => {
  const hardware = await startHardware()
  const { server: remote, posts } = await startRemote()
  const api = apiFor(hardware, remote)

  assert.equal(await api.healthCheckin({ channels: null }, [], {}, []), true)
  assert.deepEqual(JSON.parse(posts[0]).stats, { channels: null })
  await close(hardware, remote)
})

// ---------------------------------------------------------------------------
// reachability probe
// ---------------------------------------------------------------------------

test('checkServerReachable is true only on a 200 from the real host', async () => {
  const hardware = await startHardware()
  const ok = await startRemote({ status: { status: 200 } })
  assert.equal(await apiFor(hardware, ok.server).checkServerReachable(), true)
  await close(ok.server)

  const bad = await startRemote({ status: { status: 502 } })
  assert.equal(await apiFor(hardware, bad.server).checkServerReachable(), false)
  await close(bad.server, hardware)
})

test('checkServerReachable resolves false rather than throwing when the host is down', async () => {
  const hardware = await startHardware()
  const { server: remote } = await startRemote()
  const api = apiFor(hardware, remote)
  await close(remote)

  assert.equal(await api.checkServerReachable(), false)
  await close(hardware)
})

test('a failed reachability probe does not block the checkin (fail-open)', async () => {
  const hardware = await startHardware()
  const { server: remote, posts } = await startRemote({
    status: { status: 503 },      // probe says the server is unhappy
    checkin: [{ status: 204 }],   // but the checkin endpoint accepts
  })
  const api = apiFor(hardware, remote)

  assert.equal(await api.healthCheckin(makeStats(), [], {}, []), true)
  assert.equal(posts.length, 1, 'the POST was attempted despite the probe')
  await close(hardware, remote)
})

test('checkInternet keeps returning a real boolean and cannot hang', async () => {
  const hardware = await startHardware({ hangEndpoint: 'internet/status' })
  const api = apiFor(hardware)
  const started = Date.now()

  assert.equal(await api.checkInternet(), false)
  assert.ok(Date.now() - started < 3000, 'bounded by hardware_timeout_ms')
  await close(hardware)
})

// ---------------------------------------------------------------------------
// pollSensors must not be able to kill the process
// ---------------------------------------------------------------------------

test('pollSensors against a dead hardware server produces no unhandled rejection', async () => {
  // On lts_26_07.iso pollSensors was `fetch(uri).then(...)` with no .catch, and
  // nothing in src/ installs an unhandledRejection handler. Node's default
  // --unhandled-rejections=throw turns that into an uncaught exception, so an
  // unreachable hardware server took down station-radio-interface (systemd
  // Restart=on-failure/RestartSec=5 then restarts it, losing the in-memory
  // sensor buffer and radio stats).
  const hardware = await startHardware()
  const api = apiFor(hardware)
  await close(hardware) // nothing listening on that port now

  const rejections = []
  const onRejection = (err) => rejections.push(err)
  process.on('unhandledRejection', onRejection)
  try {
    api.pollSensors()
    await new Promise((r) => setTimeout(r, 500))
  } finally {
    process.off('unhandledRejection', onRejection)
  }

  assert.deepEqual(rejections, [], 'the fetch failure was handled')
  assert.equal(api.sensor_data.length, 0, 'nothing was buffered')
})

test('pollSensors buffers a reading and honours max_sensor_records', async () => {
  const hardware = await startHardware()
  const api = apiFor(hardware)
  api.max_sensor_records = 2

  for (let i = 0; i < 4; i++) {
    api.pollSensors()
    await new Promise((r) => setTimeout(r, 60))
  }
  assert.equal(api.sensor_data.length, 2, 'oldest records shifted off')
  assert.ok(api.sensor_data[0].received_at, 'stamped with received_at')
  await close(hardware)
})

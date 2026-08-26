#!/usr/bin/env node
/**
 * probe-radio-config — discover the ATmega32u4 radio firmware's config surface
 * over a ctt-radio-driver socket, without reflashing anything.
 *
 * The driver at /run/ctt/radios/ch<N>.sock accepts multiple clients, so this
 * attaches alongside station-radio-interface. NDJSON both ways:
 *   in : {"t":"hello"|"data"|"bye", line?: "<serial line>"}
 *   out: {"t":"cmd","op":"raw","arg":"<command>"}
 *
 * The firmware answers a command with {"key":"<k>","res":true} or
 * {"key":"<k>","res":false,"err":"..."} — so "res" tells us the key exists and
 * "err" tells us the value was wrong. Both are informative; only an ignored
 * command means the key is unknown.
 *
 * Candidate keys are NOT guessed: they are the printable tokens extracted from
 * ss_v3.0.0.hex / ss_v4.0.0.hex (see fw-tokens.sh).
 *
 * Modes:
 *   query  (default) send each bare key. Non-mutating in intent: no value is
 *          supplied. A firmware that parses "k" as "set k to empty" will answer
 *          res:false, which still identifies the key.
 *   set    send explicit --set k:v pairs. MUTATES the channel's radio config.
 *   listen passively print decoded lines (use to confirm detections still flow).
 *
 * On exit the channel's preset is re-issued (default preset:fsktag) unless
 * --no-restore, so a probe cannot leave a radio misconfigured.
 */
import net from 'node:net'

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(name)
  return i === -1 ? dflt : argv[i + 1]
}
const has = (name) => argv.includes(name)

const SOCKET   = arg('--socket', '/run/ctt/radios/ch5.sock')
const MODE     = arg('--mode', 'query')
const WAIT_MS  = Number(arg('--wait', 700))
const RESTORE  = arg('--restore', 'preset:fsktag')
const SETS     = argv.reduce((acc, a, i) => (a === '--set' ? [...acc, argv[i + 1]] : acc), [])

// Keys observed in the firmware string tables. v3-only keys are probed too:
// a rejection from v4 is itself the v3-vs-v4 surface diff.
const KEYS = [
  'version',        // known-good, proves the transport before anything else
  'tx_frequency', 'rxbw', 'modulation', 'rx_type', 'rx_size', 'tx_dbm',
  'mode', 'rx_async',                        // v3 string table only
  'preset',                                  // bare, no value
]
// Enumerated values seen in the tables, reported for reference (not sent in query mode).
const VALUES = {
  preset:     ['fsktag', 'ooktag', 'node2', 'node3', 'node3_tx', 'es200'],
  modulation: ['fsk', 'gmsk', 'ook'],
  rx_type:    ['tag_fsk', 'tag_ook', 'node_coded_id', 'node_health', 'node_v2', 'telemetry', 'tracker', 'qaqc'],
}

const sock = net.connect(SOCKET)
sock.setEncoding('utf8')
let buf = ''
const lines = []              // every serial line the radio emitted
let sink = null               // active per-command collector

sock.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\n')) !== -1) {
    const raw = buf.slice(0, nl); buf = buf.slice(nl + 1)
    if (!raw) continue
    let msg
    try { msg = JSON.parse(raw) } catch { continue }
    if (msg.t === 'hello') { console.log(`# hello  device=${JSON.stringify(msg.device)}`); continue }
    if (msg.t === 'bye')   { console.log(`# bye    reason=${msg.reason}`); continue }
    if (msg.t !== 'data' || typeof msg.line !== 'string') continue
    const line = msg.line.trim()
    lines.push(line)
    if (sink) sink(line)
    if (MODE === 'listen') console.log(line)
  }
})
sock.on('error', (e) => { console.error(`socket error: ${e.message}`); process.exit(1) })

const send = (cmd) => sock.write(JSON.stringify({ t: 'cmd', op: 'raw', arg: cmd }) + '\n')

/** Send one command, gather every line that arrives inside the window. */
function ask (cmd) {
  return new Promise((resolve) => {
    const got = []
    sink = (line) => got.push(line)
    send(cmd)
    setTimeout(() => { sink = null; resolve(got) }, WAIT_MS)
  })
}

/** A reply is "about" our command when it carries a key/res pair. */
function classify (cmd, got) {
  const key = cmd.split(':')[0]
  for (const line of got) {
    let j
    try { j = JSON.parse(line) } catch { continue }
    if (j && typeof j === 'object' && 'res' in j)
      return { verdict: j.res ? 'ACCEPTED' : 'KEY KNOWN, VALUE REJECTED', reply: line }
    if (j && j.name === 'SensorStationRadio')
      return { verdict: 'ACCEPTED', reply: line }
  }
  // Detections keep streaming regardless; only an absent key/res reply is silence.
  return { verdict: got.length ? 'NO REPLY (only detections)' : 'NO REPLY', reply: got[0] ?? '' }
}

const pad = (s, n) => String(s).padEnd(n)

await new Promise((r) => sock.once('connect', r))
console.log(`# socket ${SOCKET}  mode=${MODE}  wait=${WAIT_MS}ms\n`)

if (MODE === 'listen') {
  console.log('# passive listen — ctrl-c to stop')
} else {
  const probes = MODE === 'set' ? SETS : KEYS
  if (MODE === 'set' && !probes.length) { console.error('--mode set needs at least one --set k:v'); process.exit(2) }
  console.log(pad('COMMAND', 22) + pad('VERDICT', 28) + 'REPLY')
  console.log('-'.repeat(96))
  for (const cmd of probes) {
    const { verdict, reply } = classify(cmd, await ask(cmd))
    console.log(pad(cmd, 22) + pad(verdict, 28) + reply)
  }
  if (!has('--no-restore')) {
    console.log(`\n# restoring: ${RESTORE}`)
    await ask(RESTORE)
  }
  console.log(`\n# ${lines.length} serial lines seen during the run`)
  console.log('# enumerated values from the firmware string tables (for --mode set):')
  for (const [k, v] of Object.entries(VALUES)) console.log(`#   ${pad(k, 12)} ${v.join(', ')}`)
  sock.end()
}

// Send one command to a channel and print every line the radio returns for a
// short window. Used to read terra's cumulative counters at phase end: each
// phase begins with a flash, so the MCU's counters start at zero and a single
// read at the end IS the phase total.
import net from 'node:net'
const ch = process.argv[2] || '5'
const cmd = process.argv[3] || 'status'
const ms = Number(process.argv[4] || 2500)
const s = net.connect(`/run/ctt/radios/ch${ch}.sock`)
s.setEncoding('utf8')
let buf = '', got = []
s.on('connect', () => setTimeout(() => s.write(JSON.stringify({ t: 'cmd', op: 'raw', arg: cmd }) + '\n'), 200))
s.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const raw = buf.slice(0, i); buf = buf.slice(i + 1)
    try { const m = JSON.parse(raw); if (m.line) got.push(m.line) } catch {}
  }
})
s.on('error', (e) => { console.log('ERR ' + e.code); process.exit(1) })
setTimeout(() => {
  // Prefer the status/diagnostic lines; they are the ones carrying counters.
  const keep = got.filter((l) => /irq_count|gate_dropped|firmware|radio_ok/.test(l))
  console.log((keep.length ? keep : got).join('\n'))
  process.exit(0)
}, ms)

// Set terra's ecc mode and read it back from status. Prints "ok <ecc>" or FAIL.
import net from 'node:net'
const [ch, val] = [process.argv[2], process.argv[3]]
const s = net.connect(`/run/ctt/radios/ch${ch}.sock`)
s.setEncoding('utf8')
let buf = '', res = null, back = null
const send = (c) => s.write(JSON.stringify({ t: 'cmd', op: 'raw', arg: c }) + '\n')
s.on('connect', () => { setTimeout(() => send(`ecc:${val}`), 200); setTimeout(() => send('status'), 1200) })
s.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const raw = buf.slice(0, i); buf = buf.slice(i + 1)
    let m; try { m = JSON.parse(raw) } catch { continue }
    if (!m.line) continue
    let j; try { j = JSON.parse(m.line) } catch { continue }
    if (j.key === 'ecc') res = j.res
    if (j.key === 'status' && j.ecc !== undefined) back = j.ecc
  }
})
s.on('error', () => { console.log('FAIL socket'); process.exit(1) })
setTimeout(() => {
  if (back === null) { console.log('FAIL no-status'); process.exit(1) }
  console.log(`${res === true ? 'ok' : 'res=' + res} ${back}`)
  process.exit(0)
}, 3000)

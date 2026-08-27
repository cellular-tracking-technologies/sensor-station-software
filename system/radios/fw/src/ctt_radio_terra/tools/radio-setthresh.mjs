// Set terra's RegRssiThresh at runtime and read it back from status.
// Prints "<reply-res> <readback-hex> <readback-dbm>" or "FAIL".
import net from 'node:net'
const [ch, dbm] = [process.argv[2], process.argv[3]]
const send = (sock, cmd) => sock.write(JSON.stringify({ t: 'cmd', op: 'raw', arg: cmd }) + '\n')
const s = net.connect(`/run/ctt/radios/ch${ch}.sock`)
s.setEncoding('utf8')
let buf = '', res = null, hex = null
s.on('connect', () => {
  setTimeout(() => send(s, `rssi_thresh:${dbm}`), 200)
  setTimeout(() => send(s, 'status'), 1200)
})
s.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const raw = buf.slice(0, i); buf = buf.slice(i + 1)
    let m; try { m = JSON.parse(raw) } catch { continue }
    if (!m.line) continue
    let j; try { j = JSON.parse(m.line) } catch { continue }
    if (j.key === 'rssi_thresh') res = j.res
    if (j.key === 'status' && j.rssi_thresh) hex = j.rssi_thresh
  }
})
s.on('error', () => { console.log('FAIL socket'); process.exit(1) })
setTimeout(() => {
  if (hex === null) { console.log('FAIL no-status'); process.exit(1) }
  const reg = parseInt(hex, 16)
  console.log(`${res === true ? 'ok' : 'res=' + res} ${hex} ${-(reg / 2)}`)
  process.exit(0)
}, 3000)

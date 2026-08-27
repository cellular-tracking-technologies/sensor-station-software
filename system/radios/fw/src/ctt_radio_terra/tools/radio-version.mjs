// Query firmware version on each channel via the ctt-radio-driver socket.
import net from "node:net"
const chans = (process.argv[2] || "1,2,3,4,5").split(",")
const one = (ch) => new Promise((res) => {
  const s = net.connect(`/run/ctt/radios/ch${ch}.sock`)
  let out = [], done = false
  s.setEncoding("utf8"); let buf = ""
  const finish = (v) => { if (done) return; done = true; try { s.destroy() } catch {} ; res({ch, v}) }
  s.on("connect", () => setTimeout(() => s.write(JSON.stringify({t:"cmd",op:"raw",arg:"version"})+"\n"), 150))
  s.on("data", (d) => {
    buf += d
    let i
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i+1)
      try {
        const m = JSON.parse(line)
        if (m.line) {
          out.push(m.line)
          try { const j = JSON.parse(m.line); if (j.firmware) return finish(j.firmware) } catch {}
        }
      } catch {}
    }
  })
  s.on("error", (e) => finish("ERR:"+e.code))
  setTimeout(() => finish(out.length ? "no-version-reply" : "silent"), 3000)
})
for (const ch of chans) { const r = await one(ch); console.log(`  ch${r.ch}: ${r.v}`) }

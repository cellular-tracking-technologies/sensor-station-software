// Proxy the modem signal strength from the hardware API for the dashboard's
// modem icon. The icon's connected/not-connected state is driven by the real
// connectivity probe (/modem/ppp), NOT by ModemManager's `state`.
//
// Why not trust mmcli `state`: on the Telit LE910Q1 (CDC-ECM) mmcli reports
// `connected` as soon as it has a bearer, even when the modem-side NAT isn't
// actually forwarding traffic (e.g. just after a power-cycle, before the data
// session re-establishes). That's a false positive — the same one the ping
// probe was built to catch. Trusting it made the dashboard claim "connected"
// while no data could flow.
//
// /modem/ppp is an actual ping to 1.1.1.1 bound to the modem interface. We treat
// reachable === true as the single source of truth for "connected", which is
// exactly the signal the diag-B status LED uses (station-leds-v3.js). So the
// dashboard icon and the B LED now always agree: both green/on when the modem
// can really move data, both red/off when it can't. Raw mmcli state is kept as
// `modem_state` for diagnostics.
export default async (req, res) => {
  try {
    const [info, ppp] = await Promise.all([
      fetch('http://localhost:3000/modem/signal-strength').then(r => r.json()).catch(() => null),
      fetch('http://localhost:3000/modem/ppp')
        .then(r => r.json())
        .catch(() => ({ ppp: false })), // probe unavailable -> treat as not connected
    ])

    const reachable = ppp && ppp.ppp === true

    // `info` is null when the hardware server has no fresh modem poll (modem
    // mid-bringup, busy, or absent). Don't dereference it — the old proxy passed
    // null straight through and render_modem shows its no-signal icon. Mirror
    // that, but still report connected if the reachability probe says so.
    if (!info) {
      res.json(reachable ? { state: 'connected', reachable } : null)
      return
    }

    res.json({
      ...info,
      modem_state: info.state, // raw mmcli state, preserved for diagnostics
      reachable,
      state: reachable ? 'connected' : 'disconnected',
    })
  } catch (err) {
    console.error(err)
    res.sendStatus(500)
  }
}

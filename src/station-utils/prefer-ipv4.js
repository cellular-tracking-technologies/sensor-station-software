// Force IPv4-first hostname resolution for this service (side-effect import).
//
// The station's internal control plane talks to station-hardware-server over
// `http://localhost:3000`, and that server binds IPv4-only (127.0.0.1:3000).
// Node >= 17 resolves names in "verbatim" order, and /etc/hosts maps `localhost`
// to both 127.0.0.1 and ::1 (with ::1 first), so fetch('http://localhost:3000')
// connects to ::1 first and gets `ECONNREFUSED ::1:3000`. On 2.0.0 this broke
// station check-ins, data upload, LED status, and the LCD stats screen fleet-wide.
//
// Setting ipv4first restores the pre-Node-17 behavior (localhost -> 127.0.0.1),
// matching the server's bind, WITHOUT exposing the hardware API beyond loopback
// (which binding the server to `::`/0.0.0.0 would have done). Import this as the
// FIRST import in each service entry point so it takes effect before any client
// code performs a lookup.
import dns from 'node:dns'

dns.setDefaultResultOrder('ipv4first')

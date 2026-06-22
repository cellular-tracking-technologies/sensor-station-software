# station-hardware-server

A small Express HTTP API that exposes the sensor station's hardware behind REST.
It binds to `127.0.0.1:3000` (localhost only) and is the single point through
which the station's other services — the radio interface, the LCD interface, and
the local web dashboard — read sensors, query the modem and GPS, drive LEDs, and
manage USB storage. Those services do not touch the hardware directly; they call
this API instead.

This service is a **consumer** of the station's native layer (see the
[repo README](../../README.md) for the full layering picture). Where a piece of
hardware is owned by a native daemon, the matching route is a thin reader of that
daemon's published file or a cached poll of a system tool, rather than direct
device I/O. For example, `/sensor` reads the JSON snapshot written by the
`ctt-sensors` daemon instead of opening the I2C bus itself.

`Express` · Node.js (ES modules) · binds `127.0.0.1:3000`

---

## Quick Start

In production the service runs as a systemd unit
([system/systemd/station-hardware-server.service](../../system/systemd/station-hardware-server.service)),
ordered after the board-identity daemon so the board revision is known before the
Node chain starts. The radio, web, and LCD units start after this one.

For development, run it directly from the repo root:

```bash
npm install
npm run start-hardware-server   # node ./src/station-hardware-server/bin/www.js
```

The port can be overridden with the `PORT` environment variable; it defaults to
`3000` and always listens on `127.0.0.1` only.

---

## Architecture

```
station-hardware-server/
├── app.js                 Express app: JSON body parsing, route mounting, JSON error/404 handlers
├── bin/
│   └── www.js             HTTP server bootstrap; binds 127.0.0.1:3000 (PORT overridable)
├── routes/
│   ├── index.js           station identity, revision, OS/about info
│   ├── sensor.js          ADC voltages + board temperature (reads /run/ctt/sensors.json)
│   ├── modem.js           cellular modem info, signal, connectivity probe, enable/disable
│   ├── gps.js             GPS fix/info via a gpsd client
│   ├── internet.js        gateway, ping, WiFi, pending-upload byte counts
│   ├── usb.js             removable-storage list/mount/unmount, data copy, WiFi-from-USB
│   ├── led.js             V2 status-LED control (GPS / diag A / diag B)
│   ├── control.js         reboot-schedule (cron) read/update
│   ├── peripherals.js     enumerate connected USB peripherals
│   ├── radio-server.js    proxy commands to the radio interface over WebSocket; read station config
│   ├── program-radios.js  flash receiver firmware
│   └── list-devices.js    list attached serial/radio devices
└── scripts/               standalone LED helper scripts
```

The route modules pull in shared hardware helpers from the sibling
[`src/hardware/`](../hardware/), [`src/gps-client/`](../gps-client/), and
[`src/usb-storage-driver/`](../usb-storage-driver/) packages.

---

## API

All responses are JSON unless noted. Routes are `GET` except where marked.

| Method | Path | Purpose | Source of data |
|--------|------|---------|----------------|
| GET | `/` | Liveness check (`{ welcome: true }`) | static |
| GET | `/id` | Station hardware ID | board identity |
| GET | `/revision` | Board revision + version | board identity |
| GET | `/about` | Station ID, boot count, image/software version, module info, load, memory, uptime, disk usage | board identity + OS helpers |
| GET | `/node/version` | This service's package version | `package.json` |
| GET | `/sensor/voltages` | ADC rail voltages | `/run/ctt/sensors.json` (`ctt-sensors` daemon) |
| GET | `/sensor/temperature` | Board temperature | `/run/ctt/sensors.json` (`ctt-sensors` daemon) |
| GET | `/sensor/details` | Combined voltages + temperature snapshot | `/run/ctt/sensors.json` (`ctt-sensors` daemon) |
| GET | `/modem` | Modem info (model, signal, SIM, registration) | cached `mmcli` poll |
| GET | `/modem/signal-strength` | Same shaped modem info (signal fields) | cached `mmcli` poll |
| GET | `/modem/ppp` | Internet reachability over the modem interface (`{ ppp, interface, ageMs }`) | background connectivity probe (ping) |
| GET | `/modem/enable-modem` | Bring the modem connection up | runs `enable-modem.sh` |
| GET | `/modem/disable-modem` | Take the modem connection down | runs `disable-modem.sh` |
| GET | `/gps` | Current GPS fix / recent records | `gpsd` client |
| GET | `/internet/gateway` | Default route to the internet | network helper |
| GET | `/internet/status` | Ping success/fail counts (`?ping_count=`) | ICMP ping |
| GET | `/internet/wifi-networks` | Current WiFi network + signal | WiFi helper |
| GET | `/internet/pending-upload` | Byte/file counts of data queued for upload | counts `/data/rotated/*.gz` + `/data/SGdata/*/*.gz` |
| GET | `/internet/enable-wifi` | Enable WiFi | runs `enable-wifi.sh` |
| GET | `/internet/disable-wifi` | Disable WiFi | runs `disable-wifi.sh` |
| GET | `/internet/delete-connections` | Remove stored network credentials | runs `delete-credentials.sh` |
| GET | `/usb` | List USB-bus block devices | `drivelist` |
| GET | `/usb/mount` | Mount the USB drive at `/mnt/usb` | USB storage driver |
| GET | `/usb/unmount` | Unmount `/mnt/usb` | USB storage driver |
| GET | `/usb/data` | Copy `/data` to USB (10-minute timeout) | USB storage driver |
| GET | `/usb/wifi` | Load WiFi credentials from `/mnt/usb/wifi/credentials.json` and join the network | reads USB file → `nmcli` |
| GET | `/peripherals` | Enumerate connected USB peripherals | USB helper |
| GET | `/list-devices` | List attached serial/radio devices | runs `list-devices.sh` |
| POST | `/led/gps` | Set GPS LED state (`on`/`off`/`toggle`/`blink`) — V2 boards only | LED driver |
| POST | `/led/diag/a` | Set diagnostic A LED state — V2 boards only | LED driver |
| POST | `/led/diag/b` | Set diagnostic B LED state — V2 boards only | LED driver |
| GET | `/control/reboot-schedule` | Read the scheduled reboot (cron) | crontab |
| POST | `/control/update-reboot-schedule` | Update the reboot schedule (`minute,hour,dom,mon,dow`) | crontab |
| GET | `/radio/config` | Read the persistent station config | `/etc/ctt/station-config.json` |
| GET | `/radio/qaqc` | Trigger a QA/QC self-test on the radio interface | WebSocket command → radio interface |
| GET | `/radio/checkin` | Trigger an immediate cloud check-in | WebSocket command → radio interface |
| GET | `/program-radios` | Flash receiver firmware | runs `program-radios` with a pinned `.hex` |

Notes:

- The modem routes share a **cache** ([src/hardware/pi/network/modem-cache.js](../hardware/pi/network/modem-cache.js)):
  `mmcli` is polled only while a client is actively requesting, so the station does
  not fork `mmcli` continuously when nothing is watching.
- `/modem/ppp` is a real connectivity probe (a periodic ping bound to the modem
  interface), not just an interface-up check — an unprovisioned modem can raise its
  interface without actually forwarding traffic.
- The `/led/*` routes are only registered on V2 boards. On V3, status LEDs are
  driven by a native daemon via a separate runtime contract (see the repo README),
  so this service does not expose them.

Errors return `{ error: <message> }` with the relevant status; unknown paths
return `404 { error: 'page not found' }`.

---

## Relationship to the rest of the station

This API sits between the station's application services and the hardware/native
layer.

**Consumers (clients of this API):**

| Caller | Why it calls in |
|--------|-----------------|
| `station-radio-interface` | Reads sensors, GPS, modem, network state to fold into check-ins; also receives `/radio/qaqc` and `/radio/checkin` commands back via WebSocket |
| `station-lcd-interface` | Reads status (GPS, voltages, modem, network) for the front-panel display |
| `station-web-interface` | Backs the local dashboard — proxies hardware reads and lets the operator trigger actions (mount USB, toggle WiFi/modem, set reboot schedule) |

**Contracts this service reads or depends on:**

| Contract | Role here |
|----------|-----------|
| `/run/ctt/sensors.json` | `/sensor/*` reads this snapshot (produced by the `ctt-sensors` daemon) |
| `/run/ctt/board.env` | Board identity behind `/id`, `/revision`, `/about` (produced by the board-detect daemon at boot) |
| `/etc/ctt/station-config.json` | `/radio/config` returns this persistent station config |
| WebSocket to the radio interface | `/radio/qaqc` and `/radio/checkin` forward commands to it |
| `gpsd` | `/gps` reads fixes through a `gpsd` client |
| `mmcli` (ModemManager) | `/modem/*` reads cellular state |

By centralizing hardware access here, shared resources (the I2C bus, the modem,
GPS) are read in one place and the other services stay free of direct device I/O.

# station-radio-interface

The core data-acquisition service of the CTT Sensor Station — the on-device
**BaseStation**. It listens to every radio receiver on the station, parses the
detections, writes them to local storage as rotating CSV files, and exposes a
live control and data channel that the local web dashboard drives. It also
keeps the station's persistent configuration, drives the front-panel status
LEDs, tracks GPS position/time, and posts periodic check-ins to a cloud backend.

Unlike a direct-to-hardware service, this process is a **consumer** of the
station's native layer: it reaches the 434 MHz receivers through unix-domain
sockets published by `ctt-radio-driver`, reads/writes small files under
`/run/ctt/`, and talks to the hardware HTTP API rather than touching shared
buses itself.

Subsystems it owns:

- **Radio acquisition** — 434 MHz receivers (via `/run/ctt/radios/chN.sock`)
  plus BluSeries receivers (via USB serial).
- **Data pipeline** — a set of per-type CSV loggers writing rotating, gzip-
  archived files to local storage.
- **Control channel** — a WebSocket control/telemetry server on port `8001`.
- **Persistent config** — `/etc/ctt/station-config.json`.
- **Status LEDs** — decision logic that writes `/run/ctt/leds`.
- **GPS** — a `gpsd` client for position and time.
- **Cloud check-ins** — periodic health POSTs to the cloud backend.

---

## Quick Start

In production the service runs as the `station-radio-interface` systemd unit
(`system/systemd/station-radio-interface.service`). For development, from the
repository root:

```bash
npm install
npm run start-radio-interface     # node ./src/station-radio-interface/index.js
```

`index.js` instantiates a single `BaseStation` with the config path
`/etc/ctt/station-config.json` and calls `init()`. There are no CLI arguments;
behaviour is driven entirely by that config file and by what is present under
`/run/ctt/`.

---

## Architecture

```
server/
├── base-station.js            orchestrator: wires every subsystem together
├── blu-base-station.js        BluSeries receiver manager (USB serial)
├── radio-receiver.js          one 434 MHz receiver: decode + emit beep/raw/fw
├── radio-transports.js        byte plumbing: SocketTransport / SerialTransport
├── station-config.js          load/save /etc/ctt/station-config.json
├── default-config.js          built-in defaults when no config file exists
├── gps-client.js              gpsd client (TPV/SKY), mean-fix tracking
├── radio-maps/                board-revision radio channel <-> path maps (V2/V3)
├── http/
│   ├── web-socket-server.js   control + live-data WebSocket server (:8001)
│   └── server-api.js          hardware-API polling + cloud health check-in
├── led/
│   ├── station-leds.js        selects V2 or V3 strategy by board version
│   ├── station-leds-v3.js     writes /run/ctt/leds (for the ctt-leds daemon)
│   └── station-leds-v2.js     legacy LED strategy
└── data/
    ├── data-manager.js        routes parsed records to the right logger
    ├── logger.js              generic buffered CSV logger (cache -> disk)
    ├── file-manager.js        filenames, rotation, gzip archiving
    ├── beep-stat-manager.js   in-memory detection counters (for check-in)
    └── *-formatter.js         per-type CSV column layouts (see Data pipeline)
```

Data flow from antenna to cloud:

```
   434 MHz receiver                      BluSeries receiver
        │ (owned by ctt-radio-driver)         │ (USB serial)
        ▼                                      ▼
  /run/ctt/radios/chN.sock              /dev/serial/by-path/…
        │ NDJSON lines                         │ serial lines
        ▼                                      ▼
  SocketTransport ──┐                  blu-base-station.js
  SerialTransport ──┤                          │
        ▼           │                          ▼
  RadioReceiver  ───┴── decode each line ──► DataManager.handleRadioBeep / handleBluBeep
        │                                      │
        │  ('beep' events also broadcast       │  routes by record type
        │   live over the WebSocket)           ▼
        │                              per-type Logger (buffered cache)
        │                                      │  flush every N seconds
        │                                      ▼
        │                              CSV files in /data  (CTT-<id>-<suffix>.csv)
        │                                      │  rotate hourly
        │                                      ▼
        │                              /data/rotated/…<timestamp>.csv.gz
        ▼                                      │
  WebSocket :8001  ◄── web dashboard           └──► (uploaded out-of-band to cloud)
        ▲
  periodic health check-in (POST) ───────────────► cloud backend
```

GPS fixes, sensor polls and the periodic check-in are driven by timers created
in `BaseStation.startTimers()`.

---

## Radio acquisition

The station receives from two families of radios, handled by two different
discovery mechanisms.

### 434 MHz receivers (socket reconciliation)

The 434 MHz receivers are not opened directly. The native `ctt-radio-driver`
owns each receiver's serial port and publishes a unix-domain socket per channel
at `/run/ctt/radios/ch<N>.sock`. `BaseStation` discovers these by
**reconciliation** rather than filesystem events (`radioSocketWatcher()` /
`reconcileRadioSockets()` in `server/base-station.js`):

- Every 3 seconds it lists `/run/ctt/radios`, matching `ch<N>.sock`.
- New sockets are attached (`startRadioSocket`); vanished ones are detached
  (`stopRadioSocket`). The directory is the single source of truth, so a missed
  event self-heals and a driver that starts after this process still gets picked
  up.

Each socket is wrapped in a `RadioReceiver` (`server/radio-receiver.js`) over a
`SocketTransport` (`server/radio-transports.js`). The driver speaks NDJSON —
one JSON object per line:

```
driver -> us:  {"t":"hello","device":{…}}                  on connect
               {"t":"data","line":"<receiver line>","seq":N,"ts":…}
               {"t":"bye","reason":…}                        on driver shutdown
us -> driver:  {"t":"cmd","op":"raw|tx|preset","arg":"…"}
```

`SocketTransport` extracts the `line` field, hands it to the same per-line
decoder used for direct serial, and translates outbound wire commands
(`preset:fsktag`, `version`, `tx:…`) into `cmd` frames. On `open`, the
receiver issues its per-channel preset/config from `config.data.radios` and
begins polling firmware (every 10 minutes).

### BluSeries receivers (USB serial)

BluSeries receivers attach over USB serial and are discovered with a `chokidar`
watcher on `/dev/serial/by-path/` (`directoryWatcher()`). `isRadio()` walks the
symlink to the underlying tty and reads `idVendor`/`idProduct` from sysfs,
positively matching only the FTDI FT231X adapter (`0403:6015`); everything else
(modem CDC ACM, debug adapters, the Feathers themselves) is skipped. Matched
ports are handed to `blu-base-station.js`, which manages the per-radio poll
loop and on/off state.

### Direct serial fallback

`RadioReceiver` is transport-agnostic. Given `socket_path` it uses
`SocketTransport`; given `port_uri` it uses `SerialTransport` (a direct
`serialport` open framed by `ReadlineParser`) — the legacy path used before the
native driver.

---

## Data pipeline

Parsed records flow into `DataManager` (`server/data/data-manager.js`), which
routes each record by type to a dedicated `Logger`. Each `Logger`
(`server/data/logger.js`) buffers formatted rows in memory and flushes to disk
on a timer (`flush_data_cache_seconds`, default 5s). On first write to a fresh
file it emits the header row from the record's formatter.

`FileManager` (`server/data/file-manager.js`) names files
`CTT-<station-id>-<suffix>.csv` under the base log directory (default `/data`).
On rotation (default hourly) the active file is moved to
`<base>/rotated/CTT-<id>-<suffix>.<YYYY-MM-DD_HHmmss>.csv`, gzip-compressed to
`.csv.gz`, and the uncompressed copy removed. The rotated `.gz` files are what
gets uploaded to the cloud out of band.

| Logger key  | File suffix   | Records                          | Columns (header) |
|-------------|---------------|----------------------------------|------------------|
| `log`       | `log`         | service log lines                | `msg at, msg` |
| `beep`      | `raw-data`    | tag detections (coded id / node) | `Time, RadioId, TagId, TagRSSI, NodeId, Validated` |
| `gps`       | `gps`         | recorded GPS fixes               | `recorded at, gps at, latitude, longitude, altitude, quality, mean lat, mean lng, n fixes` |
| `node_health` | `node-health` | node telemetry/health          | `Time, RadioId, NodeId, NodeRSSI, Battery, Celsius, …, Detections, Errors` |
| `telemetry` | `telemetry`   | GPS-tag telemetry beeps          | `ReceivedAt, RecordedAt, Id, RadioId, Rssi, Latitude, Longitude, …, TTFF` |
| `blu`       | `blu`         | BluSeries / BluTag detections    | `UsbPort, BluRadioId, RadioId, Time, TagRSSI, TagId, Sync, Product, Revision, NodeId, Payload` |
| `node_meta` | `node-meta`   | per-node collection metadata     | `NodeId, DataType, StartDate, EndDate, Protocol, …, PercentSuccess` |

In parallel, `BeepStatManager` (`server/data/beep-stat-manager.js`) keeps
in-memory detection counters that are reported in the cloud check-in and over
the WebSocket `stats` command.

---

## Control channel (WebSocket :8001)

`SensorSocketServer` (`server/http/web-socket-server.js`) runs a WebSocket
server on the configured `websocket_port` (default `8001`). The local web
dashboard is the client. The server:

- **Broadcasts** live data to all connected clients — `beep`, `gps`, `stats`,
  `log` messages, and BluSeries port add/remove events.
- **Receives** command messages keyed by `msg_type` and dispatches them in
  `BaseStation.startWebsocketServer()`:

| Command          | Effect |
|------------------|--------|
| `toggle_radio`   | Switch a channel's mode (e.g. tag/node/ook). **Mutates `station-config.json`** via `StationConfig.toggleRadioMode`, then issues the preset to the live radio. |
| `stats`          | Broadcast the current in-memory detection stats. |
| `checkin`        | Trigger an immediate cloud health check-in. |
| `upload`         | Run the `upload-station-data` command; stream its output as `log`. |
| `update-station` | Run the `update-station` command; stream its output as `log`. |
| `radio-firmware` | Broadcast the per-channel radio firmware versions. |
| `about`          | Fetch station info from the hardware HTTP API and broadcast it. |

`upload` and `update-station` spawn external commands and pipe their stdout/
stderr back over the socket as `log` messages.

---

## Configuration

State lives in `/etc/ctt/station-config.json`, managed by `StationConfig`
(`server/station-config.js`). If the file is absent or corrupt, the built-in
`server/default-config.js` is used. The dashboard and the service both write
this file — UI-driven changes (radio mode toggles, BluSeries radio state)
persist here.

Key sections (see `default-config.js` for the full default):

| Section | Notable fields |
|---------|----------------|
| `radios` | per-channel `{ channel, config, record }`; `config` is the preset command list applied on connect |
| `http`   | `websocket_port` (8001), `flush_websocket_messages_seconds` |
| `record` | `base_log_directory` (`/data`), `date_format`, `flush_data_cache_seconds`, `rotation_frequency_minutes`, `checkin_frequency_minutes`, `sensor_data_frequency_minutes`, `alive_frequency_seconds`, `enabled` |
| `gps`    | `enabled`, `record`, `seconds_between_fixes` |
| `led`    | `toggle_frequency_seconds` |
| `upload` | per-destination upload toggles |
| `blu_receivers` | per-receiver BluSeries radio list with `poll_interval` |

On save, dynamically-threaded BluSeries USB paths and per-radio runtime counters
are stripped before writing; 434 MHz radios are channel-keyed and carry no path.
Channel-to-path mapping for a given board revision comes from `radio-maps/`.

---

## Contracts

What this service reads and writes under `/run/ctt`, and the other components it
talks to.

| Interface | Direction | Producer / Consumer | Format |
|-----------|-----------|---------------------|--------|
| `/run/ctt/radios/ch<N>.sock` | read | produced by `ctt-radio-driver`; consumed here | AF_UNIX, NDJSON line stream + `cmd` frames |
| `/run/ctt/leds` | write | written here; consumed by the `ctt-leds` daemon | `key=value` per line (`gps`/`a`/`b` = `on`\|`off`\|`blink`), written atomically (temp + rename) |
| `/etc/ctt/station-config.json` | read/write | shared with the web dashboard | JSON (persistent) |
| `/dev/serial/by-path/*` | read | OS udev; filtered by VID:PID | symlinks to tty devices (BluSeries discovery) |
| `/data/` (+ `/data/rotated/`) | write | local storage | rotating + gzip CSV |
| Hardware HTTP API (`localhost:3000`) | client | `station-hardware-server` | REST — sensor details, modem/PPP, GPS, `about`, upload state, versions |
| `gpsd` (`localhost:2947`) | client | system `gpsd` | gpsd protocol (TPV/SKY) |
| WebSocket `:8001` | server | local web dashboard | JSON control + live data |
| Cloud check-in | client (POST) | cloud backend | JSON health/stats payload, periodic |

The status-LED logic (`server/led/station-leds-v3.js`) makes its decision from
GPS fix age/mode and the modem PPP state (polled from the hardware API) and
encodes the desired LED state into `/run/ctt/leds`; the native `ctt-leds`
daemon performs the actual I/O. On V2 boards a legacy strategy is selected
instead (`station-leds-v2.js`), chosen by board version in `station-leds.js`.

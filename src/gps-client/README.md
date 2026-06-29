# gps-client

A small `gpsd` client helper shared by the station's Node.js services. It keeps a
live connection to the local `gpsd` daemon and caches the most recent position,
time, and satellite information so callers can read the current fix synchronously
without speaking the `gpsd` protocol themselves.

GPS data on the station is produced by a u-blox / Quectel GNSS module, surfaced
by the system `gpsd` daemon on its standard port (2947). This package is a thin
consumer of that daemon — see [Runtime contracts](../../README.md#runtime-contracts)
in the repo root README.

## Layout

```
gps-client/
├── index.js        GpsClient class (the entire public API)
└── test/index.js   manual exercise of the client
```

## API

`GpsClient` extends Node's `EventEmitter`.

```js
import { GpsClient } from './gps-client/index.js'

const gps = new GpsClient({ max_gps_records: 100 })

gps.on('initial-fix', (fix) => { /* first 2D/3D fix acquired */ })
gps.on('3d-fix',      (fix) => { /* every 3D fix */ })
gps.on('initial-sky', (sky) => { /* first satellite view */ })

gps.start()        // connect to gpsd and begin watching reports
const snapshot = gps.info()
gps.stop()         // disconnect
```

### Constructor

`new GpsClient({ max_gps_records })` — `max_gps_records` bounds the rolling
buffer of recent fixes used to compute an averaged position.

### Methods

| Method | Description |
|--------|-------------|
| `start()` | Connect to `gpsd` (localhost:2947) and begin watching reports. |
| `stop()` | Disconnect from `gpsd`. |
| `info()` | Return `{ gps, sky, mean }` — the latest fix, the latest satellite view, and the mean position. |
| `meanFix()` | Average lat/lng over the buffered recent fixes; returns `{ lat, lng, n }` (6 decimal places) or `undefined` if no fixes yet. |

### Events

The client subscribes to `gpsd` `TPV` (time-position-velocity) and `SKY`
(satellite view) reports and re-emits higher-level events:

| Event | Emitted when |
|-------|--------------|
| `initial-fix` | The first valid (2D or 3D) fix is acquired. |
| `2d-fix` | A `TPV` report with mode 2 (2D fix). |
| `3d-fix` | A `TPV` report with mode 3 (3D fix); also appended to the rolling buffer. |
| `initial-sky` | The first satellite view is received. |

Fix `mode` follows the `gpsd` convention: `0` unknown, `1` no fix, `2` 2D, `3` 3D.
Only 3D fixes are added to the averaging buffer.

## Dependencies

- [`node-gpsd`](https://www.npmjs.com/package/node-gpsd) — `gpsd` protocol client.

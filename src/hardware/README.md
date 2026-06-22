# hardware

In-process Node.js helpers for talking to the station's hardware: an I2C wrapper,
on-board sensor drivers, the CTT radio-receiver drivers, board-identity readers,
a Raspberry Pi GPIO map, and a handful of system/network probes.

> **Status — partly legacy.** Direct on-board device I/O is moving into a separate
> native C++ layer (the `ctthw` library and the `ctt-*` daemons; see
> [`native/`](../../native/)). The native daemons now own shared-bus (I2C) access
> and publish results through small files under `/run/ctt/`. As that migration
> proceeds, the chip-level drivers in this package are being **superseded** by the
> native layer, while several Pi/system/radio helpers here are still in active use.
> Each section below is marked accordingly. See
> [Architecture](../../README.md#architecture) in the repo root README for the full
> picture.

## Layout

```
hardware/
├── index.js              exports { Usb, Pi }
├── usb.js                lsusb / FunCube enumeration            [active]
├── initialize.js         one-shot boot init (legacy path)       [legacy]
├── i2c/                  promisified I2C read/write wrapper      [legacy*]
├── sensors/              ADC + temperature drivers              [legacy*]
├── id-driver/            board identity / version / revision     [legacy*]
├── io-expander/          SX1509B I/O expander driver             [legacy*]
├── led-driver/           status-LED drivers (v2 / v3)            [mixed]
├── kernel/               kernel-version → GPIO pin selection     [active]
├── pi/                   Pi system + network helpers             [active]
└── ctt/                  CTT radio-receiver drivers              [active]
```

`[legacy*]` = superseded on V3 by native daemons (`ctt-sensors`,
`ctt-board-detect`, `ctt-leds`) that read the same chips and publish to
`/run/ctt/`. The code remains in the repo for reference and for older paths.

## Still in active use

These are imported by the running services (hardware-server, radio-interface,
lcd-interface):

| Path | Provides |
|------|----------|
| `usb.js` | `ListUsb()` (parsed `lsusb`) and `ListFunCubes()` (parsed `fcd -l`). |
| `pi/os.js` | System snapshot: software-update tag, disk usage, load average, memory, uptime. |
| `pi/cron.js` | Read/update the scheduled reboot entry in root's crontab. |
| `pi/network/modem.js` | Cellular modem info via `mmcli` (signal, IMSI/IMEI/ICCID, carrier, registration, RSSI). |
| `pi/network/wifi.js` | Wi-Fi scan / current network via `nmcli`. |
| `pi/network/connection.js` | ICMP ping reachability check and default-gateway lookup. |
| `pi/gpio-map.js` | Board- and OS-aware GPIO pin numbers (buttons, GPS, reset). |
| `kernel/kernel.js` | Detect kernel version (Bullseye vs Bookworm) to choose the right pin map. |
| `ctt/` | Drivers for the CTT radio receivers (see below). |

### GPIO map

`pi/gpio-map.js` resolves pin numbers for the front-panel buttons (Up/Down/Select/
Back), the GPS strap, and the reset line. The correct set depends on **both** the
board revision (V2 vs V3) **and** the OS generation — GPIO sysfs numbers changed
in Raspberry Pi OS Bookworm, so the map switches between a Bullseye and a Bookworm
table based on the detected OS release.

### CTT receivers (`ctt/`)

Drivers for the radios the station listens on:

- `ctt/atmega32u4_receiver.js` — the ATmega32U4 (Adafruit Feather) 434 MHz receiver
  used for CTT tags, over USB serial.
- `ctt/bluseries-receiver/` — a multi-channel BluSeries receiver driver: a serial
  client, a scheduler/manager for per-channel jobs (version, detections, stats,
  config, LEDs), a DFU firmware-update path, and LED control. Prebuilt adapter
  firmware images ship under `bluseries-receiver/driver/bin/`.
- `ctt/messages.js` — shared message/parsing helpers.

## Being superseded by the native layer

The following read on-board chips directly over I2C. On V3 hardware this work is
now done by native daemons, which publish to `/run/ctt/` for the services to read.

### I2C wrapper (`i2c/`)

`i2c/i2c.js` wraps [`i2c-bus`](https://github.com/fivdi/i2c-bus) with a small
promisified `read` / `write` / `readRegister` / `writeRegister` API bound to a
fixed bus + address. `i2c/scan.js` enumerates devices present on a bus.

### Sensors (`sensors/`)

A version-selecting `sensors/index.js` exposes a `SensorMonitor` that periodically
reads voltages and temperature and emits a `sensor` event with
`{ voltages: { battery, solar, rtc }, temperature: { celsius, fahrenheit } }`.

| File | Role |
|------|------|
| `sensors/v3-driver.js` | V3 monitor: MAX11645 ADC + TMP411 temperature. |
| `sensors/v2-driver.js` | V2 monitor: ADS7924 ADC + TMP102 temperature. |
| `sensors/max11645.js` | MAX11645 12-bit ADC — battery/solar voltage (V3). |
| `sensors/ads7924.js` | ADS7924 ADC — battery/solar/RTC voltage (V2). |
| `sensors/tmp411.js` | TMP411 temperature sensor (V3), extended range. |
| `sensors/tmp102.js` | TMP102 temperature sensor (V2). |
| `sensors/adc.js` | Thin ADC selector wrapper. |

> The hardware-server's `/sensor` route no longer instantiates these in-process; it
> reads `/run/ctt/sensors.json` produced by the native `ctt-sensors` daemon.

### Board identity (`id-driver/`)

Reads the station's unique ID, hardware version, and revision from on-board chips.
`id-driver/station-id-interface.js` detects whether a V3 I/O expander is present
(V3 vs V2), reads the revision from the expander, and derives the station ID from
the appropriate chip per revision:

| Hardware | ID source |
|----------|-----------|
| V3 rev 0 | DS3231 RTC EEPROM (`ds3231.js`) |
| V3 rev 1+ | AT24MAC602 serial EEPROM EUI-64 (`at24mac602.js`) |
| V2 | ATSHA204A (`atsha204a.js`) |

> On V3 this identity is now established at boot by the native `ctt-board-detect`
> tool, which writes `/run/ctt/board.env` as the single runtime source of truth.

### I/O expander (`io-expander/`)

`io-expander/expander.js` drives the SX1509B I2C I/O expander on V3 boards: pin
direction, pull-ups, set/toggle/drive of output pins, and bank state polling. Used
both for status straps (board revision) and LED control.

### LED drivers (`led-driver/`)

`led-driver/index.js` selects a V2 or V3 driver by hardware version. The V3 LED path
is being replaced by the native `ctt-leds` daemon (driven via `/run/ctt/leds`); the
V2 driver (`led-driver/v2-driver.js`) is still referenced directly.

### `initialize.js`

A one-shot boot routine that initialized the I/O expander, read board
identity/version/revision, and wrote them to disk. This is the legacy boot path,
now handled by `ctt-board-detect` on V3.

## Notes

- Most helpers shell out to standard tooling (`mmcli`, `nmcli`, `lsusb`, `df`,
  `crontab`, `uname`) and assume sufficient privileges.
- Drivers that touch I2C assume exclusive access; on V3 that contract is owned by
  the native layer, which is why direct use here is discouraged for new code.

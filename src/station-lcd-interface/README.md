# station-lcd-interface

The front-panel user interface for the CTT Sensor Station. It drives a 20x4
character LCD and four push-buttons, rendering a live status screen and a
navigable, multi-language menu from which an operator in the field can read
diagnostics and run common system operations (toggle WiFi/modem, mount a USB
drive, program radios, delete data, restart, and more).

This is a Node.js service (ES modules). It does not own any hardware state of
its own: all of its data comes from the hardware HTTP API on `127.0.0.1:3000`,
and the system operations it triggers are HTTP calls to that API or short shell
commands.

---

## Quick Start

In production the service runs as a systemd unit
([system/systemd/station-lcd-interface.service](../../system/systemd/station-lcd-interface.service)),
started after the hardware server:

```bash
systemctl start station-lcd-interface
```

For development it can be started directly from the repo root:

```bash
npm run start-lcd-interface   # node ./src/station-lcd-interface/index.js
```

The service expects the hardware HTTP API to be reachable on
`http://localhost:3000`. It does not touch the LCD directly — it publishes the
desired screen to `/run/ctt/lcd`, which the native `ctt-lcd` daemon renders onto
the panel. If that daemon is not running the menu logic still runs; the frames
are simply not displayed.

---

## Architecture

```
station-lcd-interface/
  index.js            entry point: builds the menu tree, wires GPIO buttons
  menu-manager.js     menu state machine (up / down / select / back), auto-refresh
  menu-item.js        a single menu node (id, optional view/task, children)
  menu-scroller.js    4-line scrolling window over a list of item names
  menu-translator.js  builds the menu tree per language; caches translations
  translated-menus.json   pre-translated menu strings (5 languages)
  button-map.js       maps Up/Down/Select/Back to GPIO pins (V2 vs V3 board)
  station-stats.js    the status screen (custom glyphs + positioned rendering)
  lcd-chars.js        custom HD44780 glyph bitmaps + warning thresholds
  display-driver.js   high-level LCD wrapper: clear, write rows, position glyphs
  lcd-framebuffer.js  virtual LCD: composites a framebuffer -> /run/ctt/lcd
  lcdi2c.js           legacy in-process HD44780/I2C driver (superseded; unused)
  tasks/              one class per menu action (see table below)
```

The pieces fall into three groups:

- **Menu system** — `menu-manager.js`, `menu-item.js`, `menu-scroller.js`,
  `menu-translator.js`. A tree of `MenuItem`s; the manager tracks focus and
  reacts to button presses.
- **Tasks** — `tasks/`. Each task is the "view" attached to a leaf menu item.
  It produces the lines to render and, where relevant, performs an action.
- **Display** — `display-driver.js`, `lcd-framebuffer.js`, `lcd-chars.js`,
  `station-stats.js`. Composites rows of text and custom glyphs into a
  framebuffer published to `/run/ctt/lcd`; the native `ctt-lcd` daemon renders
  it onto the panel. (`lcdi2c.js` is the legacy in-process I2C driver, retained
  but no longer used.)

---

## Menu system

The menu is a tree of `MenuItem` objects built in `menu-translator.js`
(`createItems`). Each item has:

- an `id` (the display name, localized per language),
- an optional `view` — a task object (see below) rendered when the item is
  selected, and
- a list of `children`. An item with children is a submenu; an item with a
  `view` and no children is an action/screen.

`index.js` builds the tree for English, Spanish, French, Portuguese, and Dutch
(strings are pre-translated and cached in `translated-menus.json`), then hands
the root to a `MenuManager`. The manager exposes four operations, each bound to
a button:

| Button | Operation | Behavior |
|--------|-----------|----------|
| Up | `up()` | Move selection up one row |
| Down | `down()` | Move selection down one row |
| Select | `select()` | Enter a submenu, or run/refresh the selected item's view |
| Back | `back()` | Return to the parent menu |

`MenuScroller` keeps a 4-row window over the current submenu's item names so
lists longer than the screen scroll smoothly; the selected row is marked with a
leading `>`. When a task is rendered, the manager first shows the task's
`loading()` lines, then awaits `results()` and renders those. Tasks may declare
an `autoRefresh` interval (milliseconds); the manager re-runs `results()` on
that timer until the operator navigates away.

A task is a small class with three members:

- `header` — a title string,
- `loading()` — returns the rows to show immediately, and
- `results()` — returns a `Promise` resolving to the rows to display.

### Available tasks (`tasks/`)

| Task (file) | Menu location | What it does |
|-------------|---------------|--------------|
| `StationStats` (`station-stats.js`) | Station Stats | Live status screen — WiFi/cell/battery/solar/temperature glyphs (see below) |
| `IpAddressTask` (`ip-address-task.js`) | Network > Ip Address | Lists `wlan*`/`eth*` IPv4 addresses (read locally via `os`) |
| `EnableWifi` / `DisableWifi` (`enable-disable-wifi-task.js`) | Network > WiFi | Enable/disable WiFi via `internet/enable-wifi` / `internet/disable-wifi` |
| `UsbWifiUploadTask` (`usb-wifi-upload-task.js`) | Network > WiFi > Get WiFi | Loads WiFi credentials from USB via `usb/wifi` |
| `DeleteConnections` (`delete-connections-task.js`) | Network > WiFi > Delete Connections | Clears saved WiFi credentials via `internet/delete-connections` |
| `EnableModem` / `DisableModem` (`enable-disable-modem-task.js`) | Network > Cellular | Enable/disable the cellular modem via `modem/enable-modem` / `modem/disable-modem` |
| `CellularIds` (`cellular-task.js`) | Network > Cellular > Ids | SIM / IMEI / modem info from `modem` |
| `CellularCarrier` (`cellular-task.js`) | Network > Cellular > Carrier | Carrier, signal %, and RSSI from `modem` |
| `InternetTask` (`internet-task.js`) | Network > Ping | Connected/Disconnected from `internet/status` |
| `HostnameTask` (`hostname-task.js`) | Network > Hostname | Local `*.local` hostname (read via `os`) |
| `MountUsbTask` (`usb-mount-task.js`) | File Transfer > Mount Usb | Mount removable storage via `usb/mount` |
| `UnmountUsbTask` (`usb-unmount-task.js`) | File Transfer > Unmount Usb | Unmount removable storage via `usb/unmount` |
| `UsbDownloadTask` (`usb-download-task.js`) | File Transfer > Download | Copy station data to USB via `usb/data` |
| `ProgramRadios` (`program-radios.js`) | System > Program Radios | Update radio receiver firmware via `program-radios` |
| `ListDevices` (`list-devices.js`) | System > List Devices | USB device/port and I2C device counts via `list-devices` |
| `SystemImageTask` etc. (`system-about-task.js`) | System > About | Image/update version, station IDs, RAM/disk usage, uptime, from `about` |
| `QaqcRequest` (`qaqc-task.js`) | System > QAQC | Trigger a QA/QC request via `radio/qaqc` |
| `SystemTimeTask` (`system-time-task.js`) | System > Time | RTC vs GPS vs system clock (`hwclock`, `gps`) |
| `SystemRestartTask` (`system-restart-task.js`) | System > Restart | `shutdown -r now` |
| `BashUpdateTask` (`bash-update.js`) | System > Bash Update | Run the `bash-update-station` updater |
| `DeleteDataTask` / `NoDeleteDataTask` (`system-delete-data-task.js`, `system-no-delete-data-task.js`) | System > Delete Data > Yes/No | Confirm-gated delete of station data (runs `delete-data.sh`); reports disk usage before/after |
| `ServerConnectRequest` (`server-task.js`) | Server | Trigger a backend check-in via `radio/checkin` |
| `SensorVoltageTask` (`sensor-voltage-task.js`) | Power | Battery / RTC / solar voltages from `sensor/voltages` |
| `SensorTemperatureTask` (`sensor-temp-task.js`) | Temperature | Board temperature from `sensor/temperature` |
| `GpsTask` (`gps-task.js`) | Location | Mean latitude/longitude from `gps` |
| `LedTask` (`led-task.js`) | (helper) | POST a status-LED state; available as a reusable task class |

URLs above are relative to the hardware API base `http://localhost:3000`.

---

## Status display

`station-stats.js` (`StationStats`) renders the top-level **Station Stats**
screen and refreshes it every 10 seconds. Rather than writing whole rows, it
positions data at fixed cursor coordinates and prepends a custom glyph for each
metric:

| Metric | Source | Shown as |
|--------|--------|----------|
| WiFi | `Network.Wifi.GetCurrentNetwork()` (in-process) | WiFi glyph + `:NN%`, or `:!` if down |
| Cellular | hardware API `modem` | cell glyph + `:NN%` and `:NNN dBm`, or `:!` |
| Battery | hardware API `sensor/voltages` | battery glyph + `:N.NV` |
| Solar | hardware API `sensor/voltages` | sun glyph + `:N.NV` |
| Temperature | hardware API `sensor/temperature` | `:NN°C` / `:NN°F`, or a warning marker |

The custom glyph bitmaps (5x8 dot matrices for the WiFi, battery, solar, and
cellular icons, plus the degree symbol) and the alert thresholds live in
`lcd-chars.js`. They are defined via `createChar` before each refresh; the glyph
definitions travel in the framebuffer and `ctt-lcd` writes them to the HD44780's
CGRAM.

The cellular reading is intentionally tolerant: it shows a signal value whenever
the modem reports one and is in any live state (`connected`, `registered`,
`enabled`, or `searching`), not only when the connection manager has taken over
the bearer — so signal still displays on modems whose data path is set up at the
modem itself.

---

## Hardware & integration

| Element | Detail |
|---------|--------|
| Display | 20x4 HD44780 character LCD on a PCF8574 I2C backpack, actuated by the native `ctt-lcd` daemon |
| LCD address | `0x27` or `0x3f` (detected by `ctt-lcd`, not this service) |
| Display contract | `/run/ctt/lcd` — a fixed framebuffer this service writes and `ctt-lcd` renders |
| Buttons | four GPIO push-buttons (Up / Down / Select / Back), 50 ms debounce |
| Data source | hardware HTTP API on `http://127.0.0.1:3000` |

The button GPIO pins differ between board revisions; `button-map.js` selects the
V2 or V3 pin set based on the detected hardware version, and `index.js` watches
each pin (rising edge) via the `onoff` library, calling the matching
`MenuManager` operation on each press.

`display-driver.js` is the high-level wrapper: on `init()` it runs `i2cdetect`
on each bus, finds a supported backpack address, and constructs the low-level
driver. `lcdi2c.js` is a self-contained HD44780-over-PCF8574 driver (derived from
the `lcdi2c` project) that talks to the LCD synchronously over `i2c-bus`. As the
code currently stands, **this service drives the LCD in-process over I2C.**

> **Direction of travel:** the repository also ships a native `ctt-lcd` daemon
> ([system/systemd/ctt-lcd.service](../../system/systemd/ctt-lcd.service)) that
> renders the same screen from a desired-text file at `/run/ctt/lcd`, bringing
> LCD actuation under the shared native bus-arbitration layer used by the other
> on-board devices. The intent is for this Node service to write that file
> instead of opening I2C directly. That cutover is **not yet in place** in this
> code — `station-stats.js` and `display-driver.js` still call the in-process
> driver — so both paths exist in the tree today.

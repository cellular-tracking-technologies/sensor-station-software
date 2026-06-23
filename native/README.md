# native — C++ hardware layer

Small compiled **C++17** tools and a shared static library (`ctthw`) that own
the sensor station's hardware bring-up and direct device I/O. They are started
by **systemd** and **udev**, talk to the on-board chips over I2C and serial, and
publish their results as small files and sockets under `/run/ctt/`. This lets
the Node.js application layer be a pure **consumer** of hardware state — it reads
and writes those contracts instead of touching the bus itself, which keeps all
shared-bus (I2C) access behind one arbitration layer.

These tools build **out of band** from the Node app. CI cross-compiles them to
**armhf** and publishes a versioned, checksummed binary per tool; the station's
over-the-air (OTA) update hook fetches the pinned binary for each tool.
**Stations never compile** — they only fetch prebuilt artifacts.

`C++17` · CMake · cross-compiled to armhf (Raspberry Pi OS, 32-bit)

---

## Hardware

The station targets two board generations, referred to as **V2** and **V3**.
The native layer talks to the on-board chips over **I2C bus 1** (`/dev/i2c-1`),
plus USB-serial radio receivers. Board generation is detected at boot (see
`ctt-board-detect`) and each tool selects the right chips for the board it is
running on.

### I2C bus 1 chip map

I2C addresses below are taken directly from the chip driver headers in
`lib/ctthw/chips/`. The chips present depend on board generation.

| Chip | Part | I2C address | Board | Purpose |
|------|------|-------------|-------|---------|
| I/O expander | SX1509B | `0x70` | V3 | Status LEDs (pins 0/10/11) + strapped board-revision pins; its presence on the bus distinguishes V3 from V2 |
| ADC | MAX11645 | `0x36` | V3 | 2-channel 12-bit ADC: battery + solar rail voltages |
| Temperature | TMP411 | `0x4e` | V3 | Local (board/die) temperature |
| Board-ID EEPROM | AT24MAC602 | `0x58` | V3 rev 1+ | Factory-unique EUI-64 used as the board id (id region read at `0x98`) |
| RTC / EEPROM | MCP79412 | `0x6f` (RTCC) / `0x57` (EEPROM) | V3 rev 0 | Battery-backed real-time clock; protected EEPROM holds a factory EUI-64 (board id source on rev 0) |
| Character LCD | HD44780 via PCF8574 backpack | `0x27` (primary) / `0x3f` (alt) | V2 + V3 | Front-panel status display (write-only) |

V2 variants (where the driver differs):

| Function | V2 part | Notes |
|----------|---------|-------|
| ADC | ADS7924 | Not yet ported in `ctthw` (datasheet-only) |
| Temperature | TMP102 | Not yet ported in `ctthw` |
| RTC | DS3231 | Timekeeping handled by the kernel RTC driver |
| Board id | ATSHA204A | Serial read via the `hashlet` tool (no direct bus access yet) |
| Status LEDs | GPIO-driven | No I/O expander; LED/strap path differs from V3 |

The RTCs are read by the in-kernel RTC drivers, not by these tools; `ctthw`
models only the EEPROM/identity side of the MCP79412.

---

## The `ctthw` library

`lib/ctthw/` is a shared static library that every hardware-touching tool links
against, so no tool re-implements bus access or board policy. It has three
layers:

- **`i2c/`** — `I2cBus`, a minimal `/dev/i2c-N` wrapper using the
  register-write-then-read pattern. It throws on I/O failure and never exits the
  process (that is the executable's decision). Because the bus is shared by
  several tools that can run concurrently and the kernel only locks
  per-*message*, a multi-register transaction can interleave with another
  process. `I2cBus::Lock` is an **RAII advisory `flock`** held over the bus
  device for the duration of a logical chip transaction; nested locks within one
  process are depth-counted and safe.
- **`chips/`** — one driver class per chip (`Sx1509b`, `Max11645`, `Tmp411`,
  `At24mac602`, `Mcp79412`, `Atsha204a`, `LcdPcf8574`). Each is a faithful port
  of the field-proven Node driver it replaces, so values and timing match.
- **`board/`** — board **policy** in one place. `board_id` composes the chip
  drivers to resolve identity (V3 if the SX1509B ACKs, then EUI-64 from
  AT24MAC602 or MCP79412 by revision; V2 falls back to the ATSHA204A serial).
  `sensors` selects the ADC + temperature chips by board version and returns one
  snapshot.

```
lib/ctthw/
├── i2c/
│   ├── i2c_bus.h          # I2cBus + RAII flock Lock
│   └── i2c_bus.cpp
├── chips/                 # one driver class per chip
│   ├── sx1509b.{h,cpp}    # 0x70  I/O expander (LEDs + revision straps)
│   ├── max11645.{h,cpp}   # 0x36  ADC (battery + solar)
│   ├── tmp411.{h,cpp}     # 0x4e  temperature
│   ├── at24mac602.{h,cpp} # 0x58  EUI-64 board id (V3 rev 1+)
│   ├── mcp79412.{h,cpp}   # 0x57  EUI-64 board id (V3 rev 0)
│   ├── atsha204a.{h,cpp}  # board id serial (V2, via hashlet)
│   └── lcd_pcf8574.{h,cpp}# 0x27/0x3f character LCD
└── board/
    ├── board_id.{h,cpp}   # identity composition (which chip, how to format id)
    └── sensors.{h,cpp}    # sensor snapshot, chip selection by version
```

---

## Tools

Each tool is a small executable. Most are thin shells over `ctthw`; they parse a
couple of flags, then read or write a `/run/ctt/` contract. The Node services
never see the hardware — only these files and sockets.

| Tool | Purpose | Reads | Writes |
|------|---------|-------|--------|
| `ctt-board-detect` | Boot-time board identity (runs every boot for compute-module plug-n-play) | I2C identity chips (SX1509B straps, AT24MAC602/MCP79412 EUI-64, or ATSHA204A via hashlet) | `/etc/ctt/station-id`, `/etc/ctt/station-revision`, `/etc/ctt/station-board-revision`, and `/run/ctt/board.env` (`CTT_BOARD=v2\|v3r0\|v3r3`) |
| `ctt-radio-driver@N` | Bridge one 434 MHz receiver serial port to a socket (gpsd-style) | Receiver serial line (`/dev/ctt-radio/chN`) + NDJSON commands from socket clients | `/run/ctt/radios/chN.sock` (AF_UNIX, NDJSON — one JSON object per line) |
| `ctt-sensors` | Daemon: poll the analog sensors and publish a snapshot | I2C ADC (MAX11645) + temperature (TMP411); board version from `board.env`/`station-revision` | `/run/ctt/sensors.json` (voltages + temperature + ISO-8601 timestamp) |
| `ctt-leds` | Daemon: drive the V3 status LEDs (GPS / diag-A / diag-B); idles on V2 | `/run/ctt/leds` (`key=value`: `gps`/`a`/`b` = `on\|off\|blink\|blink:<ms>`) | SX1509B output registers (the LEDs) |
| `ctt-lcd` | Daemon: render the front-panel character LCD; idles if no backpack found. Shows a boot splash until the Node app publishes its first frame. | `/run/ctt/lcd` (fixed 144-byte framebuffer: 8 CGRAM glyphs + 80 character cells) | HD44780 LCD over the PCF8574 backpack |
| `ctt-radio-flash` | One-shot: flash a radio MCU (ATmega32U4 Feather) via the GPIO-free 1200-baud-touch Caterina bootloader, then exec `avrdude`. Works for any channel — on-board or USB. | the radio's serial port (the touch) + a firmware file | the MCU flash (through `avrdude`) |

Notes:

- All decision logic stays in Node. `ctt-leds` and `ctt-lcd` own only the I2C
  actuation (including LED blink timing); Node writes the *desired* state and the
  daemon makes the hardware match it.
- `ctt-radio-driver@N` is a systemd **template** unit: a board-gated udev rule
  symlinks each receiver to `/dev/ctt-radio/chN` and starts the matching
  instance on hotplug. On unplug the serial port returns HUP and the driver
  exits cleanly, so there is no restart loop.
- `ctt-board-detect` runs before the consumers that key off identity, then
  re-fires the radio udev rules so any device that enumerated before identity
  was resolved matches its `CTT_BOARD`-gated rule.

The systemd units live in `../system/systemd/ctt-*.service`; their `ExecStart`
points at `/usr/local/bin/<tool>`. Every tool accepts `--version` (prints its
embedded `CTT_VERSION`); `ctt-board-detect` also accepts `--dry-run` and
`ctt-sensors` accepts `--once`.

---

## Build

Binaries are built reproducibly inside a **pinned Debian bullseye cross-toolchain
image** (Docker), so the ABI matches the station fleet, and cross-compiled to
**armhf**. Output bind-mounts back out to `build-arm/`. Run from this `native/`
directory.

```bash
make arm            # cross-compile the deployable armhf binaries -> build-arm/
make native         # local x86 build for fast compile-checks (NOT deployable)
make shell          # interactive shell in the build container
make clean          # remove build trees
```

On Windows / PowerShell (Docker Desktop, WSL2 backend), the equivalent of
`make arm`:

```powershell
pwsh ./build.ps1
```

Both drive the same steps: build the toolchain image from
`docker/build.Dockerfile`, then run CMake with
`cmake/toolchain-armhf-linux.cmake` (`Release`). The result is one
`build-arm/ctt-*` ARM binary per tool — built here, run on the station.

The build is defined in `CMakeLists.txt`: the `ctt_tool()` helper builds one
executable per tool, embeds `src/<tool>/VERSION` as the `CTT_VERSION`
compile-time define, and installs it to `bin/`. `ctt-radio-driver` depends on
`nlohmann/json` (system package, or vendored under `third_party/`); the other
tools link `ctthw`.

---

## Versioning & release

There is **no lockstep** — each tool versions, releases, and is pinned by the
fleet independently.

- **Per-tool VERSION** — each tool owns `src/<tool>/VERSION`, embedded into the
  binary as `CTT_VERSION` (`<tool> --version`). Bump a tool's VERSION only when
  its source changes.
- **CI release** — CI publishes a release **per tool**, gated on that tool's own
  tag (`<tool>-vX.Y.Z`), and uploads a **checksummed armhf binary**. An unbumped
  tool is not re-released.
- **Fleet pins** — `../system/native/<tool>.version` records the version each
  station should run. These pins move independently of the source VERSION (a
  source bump is not deployed until its pin is advanced).
- **OTA install** — on update, the install hook in `../system/scripts/` fetches
  the pinned binary for each tool, verifies it, and installs it to
  `/usr/local/bin/`.

Current state:

| Tool | Source `VERSION` | Fleet pin (`system/native/`) |
|------|------------------|------------------------------|
| `ctt-board-detect` | 0.1.2 | 0.1.1 |
| `ctt-radio-driver` | 0.1.0 | 0.1.0 |
| `ctt-sensors` | 0.1.0 | 0.1.0 |
| `ctt-leds` | 0.1.0 | 0.1.0 |
| `ctt-lcd` | 0.4.0 | 0.4.0 |
| `ctt-radio-flash` | 0.1.0 | 0.1.0 |

---

## How the rest of the monorepo consumes these

- `../system/` holds the OS config (systemd units, udev rules, radio maps) that
  runs these binaries.
- `../system/scripts/hooks/` install the pinned binaries from the per-tool
  GitHub releases on OTA.
- `station-radio-interface` consumes the radio driver's
  `/run/ctt/radios/*.sock`; `station-hardware-server` reads
  `/run/ctt/sensors.json`; `station-lcd-interface` writes `/run/ctt/lcd`. See
  the repo root [README.md](../README.md) for the full file/socket contract
  table.

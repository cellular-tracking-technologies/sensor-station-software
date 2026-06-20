# native — C++ build-kit

Native (compiled) tools and daemons for the sensor station, co-located with the
Node app and OS config in this monorepo. Each tool is a small C++ binary that
configures or controls hardware; they replace hardware logic that used to run in
Node at boot.

These build **out of band** from the Node app: CI cross-compiles them to armhf
and publishes versioned release assets, and the OTA fetch-hooks install the
pinned binary on each station (stations never compile).

## Tools

| Tool | Purpose | Deps |
|---|---|---|
| `ctt-radio-driver` | bridge one radio serial port ↔ AF_UNIX socket (gpsd-style, NDJSON) | nlohmann/json |
| `ctt-board-detect` | boot-time hardware identity (SX1509B/AT24MAC602/DS3231 + hashlet) → `/etc/ctt/*` + `/run/ctt/board.env` | — |

## Per-binary versioning

Each tool owns `src/<tool>/VERSION`, embedded into the binary as `CTT_VERSION`
(`<tool> --version`). Bump a tool's VERSION when its source changes; CI publishes
a release **per tool**, gated on its own tag (`<tool>-vX.Y.Z`), so an unbumped
tool is not re-released. Tools version, release, and are pinned by the fleet
independently — no lockstep.

## Build

Reproducible armhf binaries via a pinned Debian bullseye toolchain image (Docker);
output bind-mounts to `build-arm/`. Run from this `native/` directory.

    make arm            # WSL, Git Bash, macOS, Linux
    pwsh ./build.ps1    # Windows / PowerShell (Docker Desktop)

Both produce `build-arm/ctt-radio-driver` and `build-arm/ctt-board-detect` (ARM
binaries — built here, run on the station).

## How the rest of the monorepo consumes these

- `system/` holds the OS config (systemd units, udev rules, radio maps) that runs
  these binaries; the units' `ExecStart` points at `/usr/local/bin/<tool>`.
- `system/scripts/hooks/post-merge.d/` fetch-hooks install the pinned binary from
  the GitHub release on OTA.
- `station-radio-interface` consumes the radio driver's `/run/ctt/radios/*.sock`.

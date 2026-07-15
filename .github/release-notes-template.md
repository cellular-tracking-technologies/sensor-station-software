# SensorStation — OS Image __VERSION__

The operating-system image for the Cellular Tracking Technologies SensorStation — a
carrier-class, open-source wildlife-telemetry receiver and internet-connected Motus
receiving station. Flash it to a station's Compute Module for a field-ready receiver:
5 configurable radio channels (CTT tags, Nodes, FunCubes, RTL-SDRs), automatic cloud
upload over cellular / Wi-Fi / Ethernet (optional Iridium satellite), GPS/PPS timing,
a local LCD + web dashboard, and over-the-air updates.

## Download

| | |
|---|---|
| **Image**  | [`__IMG_KEY__`](__URL__) |
| **SHA256** | `__IMG_SHA__` |

Verify before flashing:

```
echo "__IMG_SHA__  __IMG_KEY__" | sha256sum -c
```

## Flash

CM3+ eMMC via `rpiboot` — see **[Flashing the Compute Module](https://cellular-tracking-technologies.github.io/ctt_documentation/flashingComputeModule.html)**. The rootfs auto-expands to fill the eMMC on first boot.

## Upgrading from an older LTS?

Coming from the previous LTS (**v1.7.0**)? This is a **major** upgrade — see the
**[Migration Guide](https://github.com/__REPO__/blob/v__VERSION__/docs/guides/migrating-to-lts_26_07.md)**
for what changed, the two behavior changes to know (**the modem ships off**; updates no longer
auto-reboot), how to re-flash, and a post-migration checklist.

## What's changed

__CHANGELOG__

## Links

- **Product:** <https://celltracktech.com/pages/sensorstation>
- **User guide:** <https://cellular-tracking-technologies.github.io/ctt_documentation/SensorStation-User-Guide.html>
- **Source:** <https://github.com/__REPO__> — open source under **AGPL-3.0-or-later**
- **Data portal:** <https://account.celltracktech.com>
- Part of the **Internet of Wildlife** / Motus network

---
_Built from `__SHORT_SHA__` · __DATE___

> ⚠️ **Pre-release** — CI-built, not yet field-validated or promoted to the LTS `latest` link.

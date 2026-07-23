# `__TOOL__` __VERSION__ · armhf

__DESCRIPTION__

One of the CTT SensorStation **native tools** (`native/`) — small, single-purpose C++
binaries cross-compiled to armhf in a pinned bullseye toolchain and **fetched by
stations at OTA time** (never compiled on-device).

## Artifacts

| | |
|---|---|
| **Binary** | [`__ASSET__`](https://github.com/__REPO__/releases/download/__TAG__/__ASSET__) |
| **SHA256** | [`__ASSET__.sha256`](https://github.com/__REPO__/releases/download/__TAG__/__ASSET__.sha256) |

Verify:

```
sha256sum -c __ASSET__.sha256
./__ASSET__ --version        # prints __VERSION__
```

## How stations get it

The OTA hook `system/scripts/hooks/post-merge.d/install-native.sh` fetches this binary
whenever the fleet pin `system/native/__TOOL__.version` reads `__VERSION__`, verifies the
sha256, and installs it to `/usr/local/bin/__TOOL__`. A station already at the pinned
version is a no-op; a download failure leaves the existing binary in place and retries
next OTA.

## What's changed __RANGE__

__CHANGELOG__

## Links

- **Source:** <https://github.com/__REPO__> — open source under **AGPL-3.0-or-later**
- **Native tool contract:** [`native/README.md`](https://github.com/__REPO__/blob/__TAG__/native/README.md) · [`system/native/README.md`](https://github.com/__REPO__/blob/__TAG__/system/native/README.md)

---
_CI-built from `__SHORT_SHA__` · __DATE___

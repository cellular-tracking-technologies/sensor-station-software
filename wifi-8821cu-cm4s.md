# WiFi on a CM4S: the `8821cu` driver was never built for the 64-bit kernel

**Subject:** `V3033D413FBC` · board `v3r3` · Raspberry Pi Compute Module 4S Rev 1.0 · kernel `6.1.21-v8+`
**Adapter:** Realtek RTL8821CU — `0bda:c811`, on hub port `1-1.7.5`
**Diagnosed:** 2026-08-18 · **Station repo HEAD:** `9bae251` (branch `fix/cm4-radio-udev-id-path`)

WiFi cannot be enabled on this station, and the cause is not configuration. It is the same class of
failure as the radio `ID_PATH` and USB-hub-map bugs: **an artifact built for the CM3-era 32-bit kernel
that did not follow the compute-module swap.** Every station converted to a CM4/CM4S has this.

This supersedes finding #5 in [station-diagnosis-v3r3-cm4s.md](station-diagnosis-v3r3-cm4s.md)
("The shipped image disables WiFi") as the *operative* blocker — see
[Relationship to the earlier finding](#relationship-to-the-earlier-finding).

> **Status: fixed.** A 64-bit build of the driver now ships in the repo and installs over OTA.
> See [Resolution](#resolution). The analysis below is kept as the record of why.

---

## Symptom

`enable-wifi.sh` appears to run cleanly, but no wireless interface ever appears.

```
$ ls /sys/class/net
eth0  lo  mdm0                      # no wlan0

$ nmcli -t -f DEVICE,TYPE,STATE device
eth0:ethernet:connected
lo:loopback:unmanaged               # NetworkManager has no WiFi device to enable
```

`nmcli radio` reporting `WIFI enabled` is misleading: that is the soft-rfkill flag, not evidence that
a device exists.

---

## Root cause

`enable-wifi.sh` deletes the blacklists and runs `modprobe` for each entry in
`kernel-chipsets.sh` (`CHIPS=( 'mt7601u' '8821cu' )`). For the fitted adapter that fails outright:

```
# modprobe 8821cu
modprobe: FATAL: Module 8821cu not found in directory /lib/modules/6.1.21-v8+
```

The module *does* exist on the station — in the wrong tree:

```
/lib/modules/6.1.21-v7+/kernel/drivers/net/wireless/8821cu.ko     (built Jul 16 2024)
  vermagic: 6.1.21-v7+ SMP mod_unload modversions ARMv7 p2v8
```

`v7+` is the **32-bit ARMv7** kernel. This station runs `6.1.21-v8+` — **aarch64**:

```
Linux sensorstation 6.1.21-v8+ #1642 SMP PREEMPT ... aarch64 GNU/Linux
```

Nothing in `system/device-tree/config-v3r*.txt` sets `arm_64bit` or `kernel=`, so the firmware picks
the default. On BCM2711 that is `kernel8.img`; a CM3 (BCM2837) boots `kernel7.img` and lands in the
`v7+` tree where the driver lives. The out-of-tree driver was built once, for the CM3-era kernel.

With no driver claiming the device, nothing binds to its USB interface:

```
/sys/bus/usb/devices/1-1.7.5:1.0/driver → does not exist
```

so there is no netdev, so there is nothing for NetworkManager to enable.

### The in-kernel driver is not a fallback

`rtw88_8821cu` is blacklisted twice (`blacklist-rtw88_8821cu.conf` and again inside `8821cu.conf`),
but that is moot: **this kernel ships no `rtw88` at all.**

```
$ ls /lib/modules/6.1.21-v8+/kernel/drivers/net/wireless/realtek/
rtl818x  rtl8xxxu  rtlwifi          # none of these claim 0bda:c811
```

rtw88's USB support and RTL8821CU chipset support landed in **6.2**; this is 6.1.21. Removing the
blacklists changes nothing.

---

## Why the obvious fixes do not work

### `arm_64bit=0` does not reach the driver

It looks like a one-line fix. It is not: on BCM2711, `arm_64bit=0` boots `kernel7l.img` (LPAE) into
the `v7l+` tree — and **that tree has no `8821cu` either.** Only plain `v7+` does.

| module tree | `8821cu` | `mt7601u` (in-kernel) |
|---|---|---|
| `6.1.21+` | no | yes |
| `6.1.21-v7+` | **yes** | yes |
| `6.1.21-v7l+` | no | yes |
| `6.1.21-v8+` ← running | no | yes |

### The station cannot rebuild it in place

```
/lib/modules/6.1.21-v8+/build            → MISSING
/usr/src/linux-headers-*                 → 6.1.21+, 6.1.21-v7+, 6.1.21-v7l+   (no v8+)
gcc -dumpmachine                         → arm-linux-gnueabihf
/usr/bin/*aarch64*                       → none
```

`raspberrypi-kernel-headers` (1:1.20230405-1) ships headers for the three 32-bit kernels only, the
userspace is `armhf`, and there is no aarch64 cross-compiler. A 64-bit module cannot be built here.
`dkms` is not installed either.

---

## Options

| # | Fix | Effort | Notes |
|---|-----|--------|-------|
| 1 | Fit an MT7601U adapter | none | `mt7601u` is in-kernel and present in *all four* trees. Workaround only — it changes the BOM. |
| 2 | **Cross-build `8821cu` for `6.1.21-v8+`, ship the prebuilt `.ko`** | medium | **Implemented — see [Resolution](#resolution).** Must be rebuilt on every kernel bump. |
| 3 | Move to a ≥6.2 kernel | large | In-kernel `rtw88_8821cu` exists; the blacklists could then go. Correct long-term, but a large change for a fleet on a pinned LTS image. |

---

## Resolution

**Option 2 is implemented.** The driver is cross-built off-station and shipped in the repo:

| Piece | Path |
|---|---|
| Prebuilt module | `system/modules/6.1.21-v8+/8821cu.ko.xz` (+ `SHA256SUMS`) |
| Reproducible build | `system/modules/build-8821cu.sh` |
| OTA install hook | `system/scripts/hooks/post-merge.d/install-kmod.sh` |
| Provenance / rebuild notes | `system/modules/README.md` |

The module is built from [morrownr/8821cu-20210916](https://github.com/morrownr/8821cu-20210916)
(pinned commit) against the `raspberrypi-kernel-headers` **arm64** `.deb` for the same version the
station already runs (`1.20230405-1`), producing
`vermagic: 6.1.21-v8+ SMP preempt mod_unload modversions aarch64` — an exact match for the running
kernel. The hook installs it to `/lib/modules/<release>/updates/`, runs `depmod`, and loads it unless
an operator has blacklisted it.

One build wrinkle worth knowing for the next kernel bump: the kbuild host tools inside the headers
package (`fixdep`, `modpost`, `genksyms`, `kconfig`) are **aarch64** binaries. Rebuilding them for an
x86_64 host drags in `bison`/`flex`/`libssl-dev` and makes `kconfig` re-run `syncconfig`, which
*deletes* the package's prepared `autoconf.h` and breaks the tree. The build script sidesteps this by
running Raspberry Pi's own tools unchanged under `qemu-user`
(`QEMU_LD_PREFIX=/usr/aarch64-linux-gnu`), so the module is built the way the distro would have built
it.

### Verified on `V3033D413FBC`

- `modprobe 8821cu` loads; `rtl8821cu` binds `1-1.7.5:1.0`; `wlan0` appears
- NetworkManager manages it (`wlan0:wifi:disconnected`) and a live scan returns
  `CellTrackTech_IoT` (ch 6) and `CellTrackTech` (ch 36/149) — 2.4 and 5 GHz both work
- OTA hook: installs + `depmod` + loads, is idempotent on re-run, and skips loading when
  `blacklist-8821cu.conf` is present
- Boot path: the interface MODALIAS `usb:v0BDApC811d0200dc00dsc00dp00icFFiscFFipFFin00` resolves via
  `modprobe -R` to `8821cu`, and a udev `add` on the interface autoloads it — so it comes up on its
  own at boot, with no explicit `enable-wifi` needed
- Also loads correctly as `.ko.xz`, matching the distro's own module format

### Also fixed

`enable-wifi.sh` swallowed `modprobe`'s error and still exited 0, which is why a driver that was
never built for this kernel presented to the operator as "WiFi won't enable" rather than "the driver
is missing". It now reports each failure and exits non-zero when no wifi driver could be loaded at
all.

---

## Relationship to the earlier finding

[station-diagnosis-v3r3-cm4s.md](station-diagnosis-v3r3-cm4s.md) #5 recorded that the image ships
`blacklist-8821cu.conf` / `blacklist-mt7601u.conf` / `blacklist-8192cu.conf`, leaving the adapter
blacklisted on the bus. That is accurate for a freshly imaged station, but it is no longer what is
blocking WiFi here: `enable-wifi.sh` has since run (it removed both blacklists and refreshed
`8821cu.conf`, stamped 19:10 on 2026-08-18), and WiFi still does not come up.

Current state of `/etc/modprobe.d`:

- `blacklist-8821cu.conf`, `blacklist-mt7601u.conf` — **removed** by `enable-wifi.sh`
- `blacklist-rtw88_8821cu.conf` — still present, harmless (no `rtw88` in this kernel)
- `no-rtl.conf` (`dvb_usb_rtl28xxu`, `rtl2832`, `rtl2830`) — **intentional and unrelated**; it keeps
  the DVB drivers off RTL-SDR dongles so userspace can claim them

So the blacklists were a real first-order problem and are now cleared; the missing 64-bit module is
the second-order one behind them.

---

## Reproducing the diagnosis

```bash
export PATH=$PATH:/sbin:/usr/sbin

uname -r                                        # 6.1.21-v8+  (aarch64)
lsusb -d 0bda:c811                              # adapter present
ls /sys/bus/usb/devices/1-1.7.5:1.0/driver      # no driver bound
ls /sys/class/net                               # no wlan0

modprobe 8821cu                                 # FATAL: not found in .../6.1.21-v8+
find /lib/modules -iname '*8821cu*'             # only under 6.1.21-v7+
modinfo /lib/modules/6.1.21-v7+/kernel/drivers/net/wireless/8821cu.ko | grep vermagic

ls /lib/modules/6.1.21-v8+/build                # MISSING -> cannot build here
gcc -dumpmachine                                # arm-linux-gnueabihf
```

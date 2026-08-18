# system/modules — prebuilt out-of-tree kernel modules

One directory per **kernel release**, holding modules cross-built off-station and
installed by the OTA hook [`../scripts/hooks/post-merge.d/install-kmod.sh`](../scripts/hooks/post-merge.d/install-kmod.sh)
into `/lib/modules/<release>/updates/`.

```
system/modules/
├── build-8821cu.sh        reproducible cross-build (run on a dev box)
└── 6.1.21-v8+/
    ├── 8821cu.ko.xz       Realtek RTL8821CU WiFi driver
    └── SHA256SUMS
```

## Why keyed by kernel release, not semver

Unlike the userspace tools in [`../native`](../native), a kernel module is only
loadable into the **exact** kernel it was compiled against — the `vermagic`
string (`6.1.21-v8+ SMP preempt mod_unload modversions aarch64`) must match byte
for byte. So these are keyed by `uname -r`, and a kernel bump means a rebuild,
not a version bump. A running kernel with no directory here simply gets nothing.

## Why these are committed rather than fetched

`install-native.sh` fetches userspace binaries from GitHub releases. Kernel
modules are committed instead, for the same reason the radio firmware in
[`../radios/fw`](../radios/fw) is: a station with no working WiFi driver may
have no uplink other than cellular, and bootstrapping the fix over the link the
fix is meant to provide is not a chain worth building. 741 KB compressed is
cheap next to that.

## `8821cu` — the RTL8821CU WiFi driver

**Why it is out-of-tree at all:** the adapter fitted to V3 boards is a Realtek
RTL8821CU (`0bda:c811`). In-kernel `rtw88` gained RTL8821CU support only in
**6.2**; the fleet runs **6.1.21**, whose `realtek/` directory ships only
`rtl818x`, `rtl8xxxu` and `rtlwifi`, none of which claim `c811`. So the driver
must come from Realtek's out-of-tree source ([morrownr/8821cu-20210916](https://github.com/morrownr/8821cu-20210916)).

**Why a v8+ build was needed:** the module in the shipped image was built for
`6.1.21-v7+` — the **32-bit ARMv7** kernel, from when stations ran a CM3. A
CM4/CM4S boots `kernel8.img` → `6.1.21-v8+` (aarch64), where that module does
not exist, so `modprobe 8821cu` fails outright and the adapter gets no driver,
no `wlan0`, and nothing for NetworkManager to enable. Full diagnosis:
[`../../wifi-8821cu-cm4s.md`](../../wifi-8821cu-cm4s.md).

Note `arm_64bit=0` is **not** a workaround: on BCM2711 that boots `kernel7l.img`
→ the `v7l+` tree, which has no `8821cu` either. Only plain `v7+` does.

### Rebuilding

```bash
./build-8821cu.sh 6.1.21-v8+ 1.20230405-1     # <kernel-release> <headers version>
```

Run it on a dev box — a station cannot build this (32-bit armhf userspace, no
aarch64 cross-compiler, and `raspberrypi-kernel-headers` ships headers only for
the three 32-bit kernels, so `/lib/modules/6.1.21-v8+/build` does not exist).

Host packages: `gcc-aarch64-linux-gnu`, `qemu-user-static`, `libc6-arm64-cross`.

The script fetches the `raspberrypi-kernel-headers` **arm64** `.deb` (headers for
the 64-bit *kernel*, even though station userspace is armhf), then builds against
it. One wrinkle worth knowing: the kbuild host tools inside that package
(`fixdep`, `modpost`, `genksyms`, `kconfig`) are **aarch64** binaries. Rebuilding
them for the host drags in `bison`/`flex`/`libssl-dev` and makes `kconfig` re-run
`syncconfig`, which deletes the package's prepared `autoconf.h` and breaks the
tree. Instead the script runs Raspberry Pi's own tools unchanged under
`qemu-user` via `QEMU_LD_PREFIX=/usr/aarch64-linux-gnu`, so the module is built
the way the distro would have built it.

The build fails loudly if `vermagic` does not match the target kernel or if the
module does not claim `0bda:c811`.

### Verifying a build

```bash
modinfo 8821cu.ko | grep -E 'vermagic|alias.*c811'
# vermagic: 6.1.21-v8+ SMP preempt mod_unload modversions aarch64
```

On the station, after the hook has run:

```bash
modinfo -n 8821cu          # /lib/modules/6.1.21-v8+/updates/8821cu.ko.xz
lsmod | grep 8821cu
ls /sys/class/net          # wlan0 present
nmcli device wifi list
```

#!/bin/bash
# Cross-build the out-of-tree 8821cu WiFi driver for a Raspberry Pi kernel.
#
# Run this on a DEV BOX, not on a station: stations have a 32-bit armhf
# userspace, no aarch64 toolchain, and no v8+ kernel headers, so they cannot
# build a 64-bit module. The product is checked into
# system/modules/<kernel-release>/8821cu.ko.xz and installed by the OTA hook
# scripts/hooks/post-merge.d/install-kmod.sh.
#
# Why this exists: the adapter fitted to V3 boards is a Realtek RTL8821CU
# (0bda:c811). Its driver is out-of-tree for kernel 6.1 (in-kernel rtw88 gained
# RTL8821CU only in 6.2), and the module shipped in the image was built for
# 6.1.21-v7+ (32-bit ARMv7) back when stations ran a CM3. A CM4/CM4S boots the
# 64-bit kernel8.img -> 6.1.21-v8+, where that module does not exist, so WiFi
# silently has no driver at all. See wifi-8821cu-cm4s.md.
#
# Usage:
#   ./build-8821cu.sh [<kernel-release>] [<raspberrypi-kernel-headers version>]
# Defaults target the LTS image's kernel:
#   ./build-8821cu.sh 6.1.21-v8+ 1.20230405-1
#
# Host requirements: aarch64-linux-gnu-gcc, qemu-aarch64-static + binfmt (the
# package qemu-user-static), an aarch64 sysroot (libc6-arm64-cross, normally
# pulled in by the cross toolchain), curl, dpkg-deb, xz.

set -euo pipefail

KREL="${1:-6.1.21-v8+}"
HDR_VER="${2:-1.20230405-1}"
DRIVER_REPO="https://github.com/morrownr/8821cu-20210916.git"
# Pin the driver source so a rebuild is reproducible. Bump deliberately.
DRIVER_COMMIT="${DRIVER_COMMIT:-7f63a9da2e8ed83403f6f920e9b1628a37b38ef4}"

# The headers .deb is arm64 even though station userspace is armhf: we need the
# headers for the 64-bit KERNEL, which is what the module is linked against.
HDR_URL="http://archive.raspberrypi.org/debian/pool/main/r/raspberrypi-firmware/raspberrypi-kernel-headers_${HDR_VER}_arm64.deb"

OUT_DIR="$(cd "$(dirname "$0")" && pwd)/$KREL"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v aarch64-linux-gnu-gcc >/dev/null || { echo "need aarch64-linux-gnu-gcc" >&2; exit 1; }
[ -e /usr/aarch64-linux-gnu/lib/ld-linux-aarch64.so.1 ] || {
  echo "need an aarch64 sysroot at /usr/aarch64-linux-gnu (install libc6-arm64-cross)" >&2; exit 1; }

echo "==> fetching kernel headers $HDR_VER (arm64)"
curl -fsSL -o "$WORK/hdr.deb" "$HDR_URL"
mkdir -p "$WORK/hdr"
dpkg-deb -x "$WORK/hdr.deb" "$WORK/hdr"
KSRC="$WORK/hdr/usr/src/linux-headers-$KREL"
[ -d "$KSRC" ] || { echo "headers $HDR_VER contain no tree for $KREL" >&2; exit 1; }

# The kbuild host tools shipped in the headers package (fixdep, modpost,
# genksyms, kconfig) are aarch64 binaries. Rather than rebuild them for the
# host -- which drags in bison/flex/libssl and, worse, makes kconfig re-run
# syncconfig and wipe the prepared tree -- run them under qemu-user against the
# cross toolchain's sysroot. This uses Raspberry Pi's own tools unchanged, so
# the module is built exactly the way the distro would have built it.
export QEMU_LD_PREFIX=/usr/aarch64-linux-gnu

echo "==> fetching driver source @ ${DRIVER_COMMIT:0:12}"
git clone -q "$DRIVER_REPO" "$WORK/src"
git -C "$WORK/src" checkout -q "$DRIVER_COMMIT"

echo "==> building for $KREL"
make -C "$WORK/src" -j"$(nproc)" \
  ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- \
  KVER="$KREL" KSRC="$KSRC" modules

KO="$WORK/src/8821cu.ko"
[ -f "$KO" ] || { echo "build produced no 8821cu.ko" >&2; exit 1; }

# vermagic must match the target kernel exactly or modprobe refuses to load it.
want="$KREL SMP preempt mod_unload modversions aarch64"
got="$(modinfo "$KO" | sed -n 's/^vermagic: *//p')"
if [ "$got" != "$want" ]; then
  echo "vermagic mismatch:" >&2
  echo "  want: $want" >&2
  echo "  got:  $got" >&2
  exit 1
fi
modinfo "$KO" | grep -q 'usb:v0BDApC811' || { echo "module does not claim 0bda:c811" >&2; exit 1; }

aarch64-linux-gnu-strip --strip-debug "$KO"

mkdir -p "$OUT_DIR"
xz -9 -c "$KO" > "$OUT_DIR/8821cu.ko.xz"
( cd "$OUT_DIR" && sha256sum 8821cu.ko.xz > SHA256SUMS )

echo "==> wrote $OUT_DIR/8821cu.ko.xz"
echo "    vermagic: $got"
echo "    $(cd "$OUT_DIR" && cat SHA256SUMS)"

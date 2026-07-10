#!/bin/bash
# firstboot-resize.sh — expand the root filesystem to fill the eMMC/SD on first boot.
#
# FAIL-SAFE by design: this runs as a normal systemd oneshot AFTER the OS is up (see
# ctt-firstboot-resize.service), NOT as PID 1 like the stock `init=.../init_resize.sh`
# cmdline hook. If anything here fails, the station has already booted and is usable
# (just at its shrunk size) — recoverable over SSH — instead of an unbootable card.
# The previous cmdline/init_resize approach ran before the OS and bricked the boot when
# it failed on the CM3+; this replaces it.
#
# One-shot via a marker (and the unit's ConditionPathExists); idempotent; fails open.

set -u

MARKER=/etc/ctt/.rootfs-expanded
[ -f "$MARKER" ] && exit 0

DISK=/dev/mmcblk0
PARTNUM=2
PART="${DISK}p${PARTNUM}"

[ -b "$DISK" ] && [ -b "$PART" ] || { echo "firstboot-resize: $PART not present; nothing to do"; exit 0; }

echo "firstboot-resize: before: $(df -h / | awk 'NR==2{print $2" total, "$5" used"}')"

# 1) Grow the root PARTITION to fill the disk, and make the kernel re-read the new size.
#    growpart (cloud-guest-utils) handles the mounted-root re-read cleanly; if it is not
#    installed (stock Raspberry Pi OS usually isn't), fall back to util-linux sfdisk+partx.
if command -v growpart >/dev/null 2>&1; then
  growpart "$DISK" "$PARTNUM" || true
else
  echo ", +" | sfdisk --no-reread -N "$PARTNUM" "$DISK" || true
  partx -u "$DISK" || true
fi

# 2) Grow the ext4 filesystem online into the enlarged partition.
resize2fs "$PART" || true

echo "firstboot-resize: after:  $(df -h / | awk 'NR==2{print $2" total, "$5" used"}')"

# Mark done so it never re-runs (belt-and-suspenders with the unit's ConditionPathExists).
mkdir -p "$(dirname "$MARKER")"
{ date -u +'%Y-%m-%dT%H:%M:%SZ'; } > "$MARKER" 2>/dev/null || touch "$MARKER" || true
exit 0

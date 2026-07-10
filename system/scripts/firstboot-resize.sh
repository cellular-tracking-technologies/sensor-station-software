#!/bin/bash
# firstboot-resize.sh — expand the root filesystem to fill the eMMC/SD.
#
# FAIL-SAFE: runs as a normal systemd oneshot AFTER the OS is up (see
# ctt-firstboot-resize.service), NOT as PID 1 like the stock init=.../init_resize.sh
# cmdline hook. If anything here fails the station has already booted and is usable at
# its shrunk size (recoverable over SSH) rather than an unbootable card.
#
# STATELESS + IDEMPOTENT: no marker file, no ConditionPathExists gate. We decide purely
# from on-disk geometry. Rationale: these images are QAQC-booted before capture, and any
# marker (or the stock init_resize cmdline key) written during that boot would be captured
# into the base image and permanently disable first-boot expand in the field. Geometry
# can't be poisoned that way — if the fs already fills the disk we no-op, otherwise we
# expand — so it is safe to run on every boot.
#
# WHY NOT init_resize: on the CM3+/CTT image init_resize grows the PARTITION fine and boots
# fine, but its two-stage reboot dance (grow partition -> reboot -> resize2fs_once grows the
# fs) never completes the fs grow here — the extra CTT boot reboots / service ordering break
# it, leaving a full-size partition with a ~3.2 GB filesystem. This does grow + resize in ONE
# pass, no reboot.

set -u

DISK=/dev/mmcblk0
PARTNUM=2
PART="${DISK}p${PARTNUM}"

[ -b "$DISK" ] && [ -b "$PART" ] || { echo "firstboot-resize: $PART not present; nothing to do"; exit 0; }

before=$(df -h / | awk 'NR==2{print $2" total, "$5" used"}')

# Read-only geometry: 512-byte sectors free after the root partition.
sectors_total=$(blockdev --getsz "$DISK" 2>/dev/null || echo 0)
part_start=$(cat "/sys/class/block/$(basename "$PART")/start" 2>/dev/null || echo 0)
part_sectors=$(blockdev --getsz "$PART" 2>/dev/null || echo 0)
free_after=$(( sectors_total - part_start - part_sectors ))

# < ~16 MiB (32768 sectors) free => the partition already fills the disk. Don't touch the
# partition table; just make sure the fs fills the partition — this is exactly the state
# init_resize leaves behind (big partition, small fs), and the state that keeps recurring.
if [ "$free_after" -lt 32768 ]; then
  resize2fs "$PART" >/dev/null 2>&1 || true
  echo "firstboot-resize: partition already fills disk; fs ensured (${before} -> $(df -h / | awk 'NR==2{print $2" total"}'))"
  exit 0
fi

echo "firstboot-resize: expanding — before: ${before}"

# 1) Grow the root PARTITION to fill the disk, using util-linux tools already on the image.
#    sfdisk --no-reread -N extends the partition in place WITHOUT a full partition-table
#    re-read (safe while root is mounted); partx -u then updates the kernel's view of the new
#    size online. This is exactly what cloud-init's growpart does internally -- so no extra
#    package (cloud-guest-utils) is needed. NOT raspi-config do_expand_rootfs: on many versions
#    that uses the resize2fs_once + reboot dance we proved does not complete on this image.
echo ", +" | sfdisk --no-reread -N "$PARTNUM" "$DISK" || true
partx -u "$DISK" || true

# 2) Grow the ext4 filesystem online into the enlarged partition.
resize2fs "$PART" || true

echo "firstboot-resize: after:  $(df -h / | awk 'NR==2{print $2" total, "$5" used"}')"
exit 0

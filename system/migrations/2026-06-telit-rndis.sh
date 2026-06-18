#!/bin/bash
# Image migration: 2025-11-10 LTS → v1.8.0 (Telit RNDIS, OTA modernization)
#
# Reads a 2025-11-10 LTS image, produces sensor-station.<today>.img in the
# same directory containing the v1.8.0 release. Encodes both the forward
# deploy (new units, udev rules, NM profiles, version stamps) and the
# cleanup (obsolete services, stale udev rules) that the live OTA does not
# perform.
#
# Usage:
#   sudo bash 2026-06-telit-rndis.sh <source.img>
#
# Example:
#   sudo bash 2026-06-telit-rndis.sh \
#     /home/bob/garage/sensor-station/images/sensor-station.latest.img
#
# Output: sensor-station.<YYYY-MM-DD>.img in the same directory as <source.img>
#
# Required tools on the build host: bash, git, awk, install, chown, losetup,
# mount, umount, cp, sync, pishrink (https://github.com/Drewsif/PiShrink).
#
# What this migration does (high level):
#   - Forward: deploys v1.8.0 systemd units, udev rules, and NetworkManager
#     profiles. Updates /etc/ctt/station-image and station-software stamps.
#   - Cleanup: removes provision-modem*.service (PPP era + boot-time RNDIS
#     provisioner — moved to manufacturing) and the obsolete 23-modem.rules
#     (superseded by 23-quectel-modem.rules).
#   - Ownership: normalizes monorepo files to the ctt user (numeric UID
#     looked up from the image's /etc/passwd so it's correct on the Pi
#     regardless of the build host's user table).
#   - Shrinks the resulting image with pishrink for distribution.

set -e

# --- args --------------------------------------------------------------

if [ -z "$1" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  cat <<EOF
Usage: sudo bash $0 <source.img>

Migrates a 2025-11-10 LTS image to v1.8.0 (Telit RNDIS).
Output: sensor-station.<today>.img in the same directory as <source.img>.
EOF
  exit 1
fi

LTS_SRC=$(readlink -f "$1")
if [ ! -f "$LTS_SRC" ]; then
  echo "ERROR: $1 not found (resolved to $LTS_SRC)" >&2
  exit 1
fi

WORKDIR=$(dirname "$LTS_SRC")
cd "$WORKDIR"

# --- migration constants -----------------------------------------------

LTS_EXPECTED_DATE=2025-11-10                  # source LTS provenance check
SSS_BRANCH=telit-le910q1-cellular             # where v1.8.0 was developed
SSS_TARGET_REF=v1.8.0                         # tag this migration targets
TODAY=$(date -Idate)
TARGET_IMG="$WORKDIR/sensor-station.${TODAY}.img"

ROOT="$WORKDIR/mnt/root"                      # where we'll mount the rootfs partition
STATION_USER=ctt                              # account that owns the monorepo on the Pi
SSS_REPO="$ROOT/lib/ctt/sensor-station-software"
SG_REPO="$ROOT/lib/ctt/sensorgnome/sensorgnome"
SRC="$SSS_REPO/system"                        # source dir for new files (inside image)
WANTS="$ROOT/etc/systemd/system/multi-user.target.wants"

# --- cleanup trap ------------------------------------------------------

LOOP=""
MOUNTED=""
cleanup() {
  set +e
  [ -n "$MOUNTED" ] && umount "$MOUNTED" && echo "  trap: unmounted $MOUNTED"
  [ -n "$LOOP" ] && losetup -d "$LOOP" && echo "  trap: detached $LOOP"
}
trap cleanup EXIT

# git as root over a checkout owned by a different user (the image tree is a
# mix of root- and bob-owned paths) trips git's dubious-ownership guard, so
# every invocation carries -c safe.directory='*'. Use a function (not a var)
# so the '*' stays a literal git value and isn't glob-expanded by the shell.
git_safe() { git -c safe.directory='*' "$@"; }

# --- preflight: copy LTS, attach loop, mount rootfs, verify provenance -----

echo "=== preflight: $(basename "$TARGET_IMG") from $(basename "$LTS_SRC") ==="
if [ -e "$TARGET_IMG" ]; then
  echo "ERROR: $TARGET_IMG already exists; remove or rename before re-running." >&2
  exit 1
fi
echo "  copy $(basename "$LTS_SRC") → $(basename "$TARGET_IMG")"
# --reflink=auto: instant CoW copy on btrfs/xfs, falls back to full copy on ext4.
cp --reflink=auto "$LTS_SRC" "$TARGET_IMG"

LOOP=$(losetup -f)
losetup -P "$LOOP" "$TARGET_IMG"
echo "  attached → $LOOP (p1=boot, p2=root)"

mkdir -p "$ROOT"
mount "${LOOP}p2" "$ROOT"
MOUNTED="$ROOT"
echo "  mounted ${LOOP}p2 → $ROOT"

# Verify we built FROM the right LTS — checks the source image's own version
# stamp rather than trusting the filename. The "latest" symlink may advance
# and we want to fail loud if it ever points at a non-2025-11-10 image.
LTS_FOUND=$(cat "$ROOT/etc/ctt/station-image" 2>/dev/null || echo "(missing)")
if [ "$LTS_FOUND" != "$LTS_EXPECTED_DATE" ]; then
  echo "ERROR: source image stamp $LTS_FOUND, expected $LTS_EXPECTED_DATE" >&2
  echo "       this migration is hardcoded for the $LTS_EXPECTED_DATE LTS." >&2
  echo "       use a different migration if your source is a different LTS." >&2
  exit 1
fi
echo "  verified LTS provenance: $LTS_FOUND"

# --- force the image's monorepo to match $SSS_TARGET_REF -------------------
# Image staging wants the repo to match a specific release tag exactly,
# regardless of whatever the LTS image's working tree drifted to. Phantom
# edits (e.g. an npm-install-bumped package-lock.json that was never
# committed) accumulate in mounted LTS images and would otherwise cause
# `git pull --ff-only` to refuse. reset --hard discards them explicitly;
# checkout -B at the tag pins us to the exact release this migration was
# written for.

echo "=== update source: sensor-station-software → $SSS_TARGET_REF ==="
git_safe -C "$SSS_REPO" fetch origin --tags
git_safe -C "$SSS_REPO" reset --hard HEAD
# Switch to the release tag. If the tag isn't reachable from origin's branch
# (e.g. branch was deleted post-release), the tag itself still works as a
# checkout target — git will detach HEAD onto it, which is fine for an image.
if git_safe -C "$SSS_REPO" rev-parse --verify "$SSS_TARGET_REF" >/dev/null 2>&1; then
  git_safe -C "$SSS_REPO" checkout -B "$SSS_BRANCH" "$SSS_TARGET_REF"
else
  echo "ERROR: tag $SSS_TARGET_REF not found after fetch" >&2
  exit 1
fi
git_safe -C "$SSS_REPO" log --oneline -1

# Sensorgnome doesn't have a hardcoded target (we follow whatever the LTS
# shipped with). Detect the current branch, reset to its upstream.
echo "=== update source: sensorgnome → hard reset to origin tip ==="
git_safe -C "$SG_REPO" fetch origin
SG_BRANCH=$(git_safe -C "$SG_REPO" rev-parse --abbrev-ref HEAD)
echo "  branch: $SG_BRANCH"
git_safe -C "$SG_REPO" reset --hard "origin/$SG_BRANCH"
git_safe -C "$SG_REPO" log --oneline -1

# --- guard: confirm checkout landed at expected v1.8.0 state ---------------
# Markers: mdm0-rename udev rule is present (RNDIS branch) and the PPP-era
# provision-modem.service is gone.
if [ ! -f "$SRC/udev/78-ctt-telit-net.rules" ] || [ -f "$SRC/systemd/provision-modem.service" ]; then
  echo "ERROR: image repo at $SRC is not the expected v1.8.0 state after checkout." >&2
  echo "       (want 78-ctt-telit-net.rules present AND provision-modem.service absent)" >&2
  exit 1
fi

# --- 0. cleanup: remove obsolete units + stale udev rules ------------------

echo "=== 0. remove obsolete units + stale udev rule ==="
rm -f "$ROOT/etc/systemd/system/provision-modem.service" \
      "$WANTS/provision-modem.service" \
      "$ROOT/etc/systemd/system/provision-modem-rndis.service" \
      "$WANTS/provision-modem-rndis.service"
echo "  removed provision-modem*.service + enable symlinks (if present)"
echo "  (RNDIS NV provisioning moved to manufacturing in v1.8.0)"
# The Ansible base build (ctt-sensor-build enable-modem role) installs the
# Quectel rule as 23-modem.rules. The v1.8.0 monorepo ships the identical
# rule as 23-quectel-modem.rules (a pure rename — R100), deployed in step 3.
# Drop the old name so we don't carry two content-identical copies.
rm -f "$ROOT/etc/udev/rules.d/23-modem.rules"
echo "  removed stale 23-modem.rules (superseded by 23-quectel-modem.rules)"

# --- 1-4. forward deploys: systemd, enable, udev, NM -----------------------

echo "=== 1. systemd: install .service files (overwrites) ==="
for s in "$SRC"/systemd/*.service; do
  install -o root -g root -m 644 "$s" "$ROOT/etc/systemd/system/$(basename "$s")"
  echo "  $(basename "$s")"
done

echo "=== 2. enable boot units: modem-boot-state ==="
mkdir -p "$WANTS"
for u in modem-boot-state.service; do
  ln -sf "/etc/systemd/system/$u" "$WANTS/$u"
  echo "  enabled $u"
done

echo "=== 3. udev rules (77 RNDIS-allow, 78-telit-net mdm0 rename, etc.) ==="
for s in "$SRC"/udev/*.rules; do
  install -o root -g root -m 644 "$s" "$ROOT/etc/udev/rules.d/$(basename "$s")"
  echo "  $(basename "$s")"
done

echo "=== 4. NetworkManager profiles (wired-con route-metric=50, etc.) ==="
for s in "$SRC"/network/*.nmconnection; do
  install -o root -g root -m 600 "$s" "$ROOT/etc/NetworkManager/system-connections/$(basename "$s")"
  echo "  $(basename "$s")"
done

# --- 4b. modem default state: OFF (matches prior images) -------------------
# modem-boot-state.sh reads /etc/ctt/modem-disabled: present => modem OFF,
# absent => modem ON. Prior images shipped this marker; without it a migrated
# image boots with the modem ON. Operators enable explicitly post-deploy.
echo "=== 4b. modem default state: disabled ==="
touch "$ROOT/etc/ctt/modem-disabled"
echo "  created /etc/ctt/modem-disabled (modem OFF by default)"

# --- 5. version stamps ------------------------------------------------------

echo "=== 5. version stamps ==="
date -Idate > "$ROOT/etc/ctt/station-image"
date '+%Y-%m-%d %H:%M:%S' > "$ROOT/etc/ctt/station-software"
echo "  station-image:    $(cat "$ROOT/etc/ctt/station-image")"
echo "  station-software: $(cat "$ROOT/etc/ctt/station-software")"

# --- 6. ownership normalization --------------------------------------------
# Look up STATION_USER's UID/GID in the IMAGE's /etc/passwd, not the build
# host's. The image's user (e.g. ctt) might not exist on the operator's
# machine, and even if a same-named user exists locally its UID may differ
# from the Pi's. chown by numeric UID:GID and the ownership is correct on
# the Pi regardless of operator environment.

echo "=== 6. ensure consistent user file ownership of repos ==="
STATION_UID=$(awk -F: -v u="$STATION_USER" '$1==u{print $3}' "$ROOT/etc/passwd")
STATION_GID=$(awk -F: -v u="$STATION_USER" '$1==u{print $4}' "$ROOT/etc/passwd")
if [ -z "$STATION_UID" ] || [ -z "$STATION_GID" ]; then
  echo "ERROR: user '$STATION_USER' not found in $ROOT/etc/passwd" >&2
  exit 1
fi
echo "  $STATION_USER → uid:$STATION_UID gid:$STATION_GID (from image's /etc/passwd)"
chown -R "$STATION_UID:$STATION_GID" "$SSS_REPO"
chown -R "$STATION_UID:$STATION_GID" "$SG_REPO"

# --- 7. authorized_keys perms ----------------------------------------------

echo "=== 7. authorized_keys mode ==="
chmod 600 "$ROOT/home/$STATION_USER/.ssh/authorized_keys"

# --- finalize: unmount, detach, shrink -------------------------------------
# pishrink MUST run after unmount + detach. Running it while the image is
# loop-attached + mounted RW corrupts the filesystem: pishrink does its own
# loop attach internally, fights with our mount, and leaves a partition
# table that doesn't match the filesystem geometry. The resulting .img will
# not boot. Order: modify → sync → umount → losetup -d → pishrink.

echo "=== finalize: unmount + detach loop ==="
sync
umount "$ROOT"
MOUNTED=""
losetup -d "$LOOP"
LOOP=""

echo "=== 8. pishrink (operates on the now-detached image file) ==="
pishrink "$TARGET_IMG"

echo
echo "done. $TARGET_IMG ready to burn or upload."

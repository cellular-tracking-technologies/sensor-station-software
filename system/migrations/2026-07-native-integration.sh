#!/bin/bash
#
# 2026-07-native-integration.sh — FORCE an in-place upgrade of a deployed field
# station from the prior LTS (lts_24-06.iso / v1.8.0 era) to the native-integration
# LTS (lts_26_07.iso / 2.0.0).
#
# >>> REFLASHING THE PREPARED IMAGE IS THE RECOMMENDED UPGRADE. <<<
# All new stations ship with the new image. This script is the FALLBACK for the
# case where a fielded station has been confirmed on a more-stable build but
# CANNOT be reflashed (no physical access). It is a best-effort in-place migration,
# not a full image swap.
#
# It runs ON a field station — delivered via the per-station OTA-script mechanism
# (station-updater.py) or run over SSH — and:
#   1. crosses the monorepo checkout from the old LTS branch to lts_26_07.iso
#      (a plain `git pull` can't switch branches), then
#   2. drives update-station so the OTA hooks deploy the native layer
#      (fetch pinned armhf binaries, install/enable systemd units + purge retired
#      ones, udev rules, network profiles), then
#   3. patches the one known OS-package delta (jq), best-effort, then
#   4. reboots to start the newly-enabled native daemons and let ctt-device-config
#      apply the canonical /boot/config.txt.
#
# SCOPE / LIMIT: migrates the git tree + native binaries + OS config that the OTA
# hooks own, plus the known `jq` package. It does NOT do a full apt upgrade or
# change the kernel — the prepared image carries an `apt upgrade` this path cannot
# reproduce. So a migrated station is 2.0.0 code on a near-but-not-identical OS
# base. For full parity, reflash.
#
# Safe by default: prints the plan and exits unless --force (or FORCE_MIGRATION=1)
# is given. Idempotent: re-running an already-migrated station is a no-op. Run as
# root (the OTA-script runner invokes delivered scripts via sudo).
#
set -u

REPO=/usr/lib/ctt/sensor-station-software
[ -d "$REPO/.git" ] || REPO=/lib/ctt/sensor-station-software
TARGET_BRANCH=lts_26_07.iso
SRC_BRANCH=lts_24-06.iso          # expected source (informational, not enforced)

log() { echo "[migrate $(date -u +%H:%M:%S)] $*"; }
die() { echo "[migrate ERROR] $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root"
[ -d "$REPO/.git" ]  || die "no monorepo checkout at $REPO"

git_repo() { git -C "$REPO" -c safe.directory='*' "$@"; }

# This is a deliberate one-off action — require an explicit force.
FORCE=0
for a in "$@"; do case "$a" in --force|-f) FORCE=1 ;; esac; done
[ "${FORCE_MIGRATION:-0}" = "1" ] && FORCE=1

# ── 0. Already migrated? ──────────────────────────────────────────────────────
cur="$(git_repo rev-parse --abbrev-ref HEAD 2>/dev/null)"
log "current branch: ${cur:-unknown}"
if [ "$cur" = "$TARGET_BRANCH" ]; then
  log "already on $TARGET_BRANCH — nothing to migrate"
  exit 0
fi

# Safe by default: without --force, print the plan and exit without touching
# anything. Reflash is the recommended upgrade; this is the can't-reflash fallback.
if [ "$FORCE" != "1" ]; then
  cat <<EOF
This will FORCE an in-place migration of THIS station: ${cur:-unknown} -> $TARGET_BRANCH
  - discard working-tree drift, then checkout the new LTS branch
  - run update-station (fetch native binaries, deploy/enable units, purge retired)
  - install jq (known OS-package delta), best-effort
  - REBOOT (twice) to converge
REFLASH is the recommended upgrade — use this only when reflash is impossible, and
note it does NOT reproduce the image's full apt upgrade (kernel/packages).
Re-run with --force (or FORCE_MIGRATION=1) to proceed.
EOF
  exit 0
fi

[ "$cur" = "$SRC_BRANCH" ] || log "WARN: source branch is '$cur', expected '$SRC_BRANCH' — proceeding"

# ── 1. Discard working-tree drift ─────────────────────────────────────────────
# Prior images carry uncommitted npm-install side-effects (package-lock.json) that
# the LTS build never committed; they would block the branch checkout.
log "clearing working-tree drift"
git_repo stash --include-untracked >/dev/null 2>&1 || true
git_repo reset --hard >/dev/null 2>&1 || true

# ── 2. Cross to the new LTS branch ────────────────────────────────────────────
# A plain `git pull --ff-only` only fast-forwards the current branch — it never
# crosses to lts_26_07.iso. Check out the branch (tracking origin) so future
# update-station OTAs keep following the LTS line. Fetch is anonymous over public
# HTTPS — no credentials needed.
log "fetching origin/$TARGET_BRANCH"
git_repo fetch --no-tags origin "$TARGET_BRANCH" || die "git fetch failed (no network?)"
log "checking out $TARGET_BRANCH"
git_repo checkout -B "$TARGET_BRANCH" "origin/$TARGET_BRANCH" || die "git checkout failed"
# git ran as root; the station owns the repo as the ctt user — restore ownership
# (update-station re-chowns too, but keep the tree correct standalone).
owner="$(stat -c '%u:%g' "$REPO")"; chown -R "$owner" "$REPO"

# ── 3. Durability barrier ─────────────────────────────────────────────────────
# Flush the freshly-checked-out tree before running hooks + rebooting; a power cut
# in the ext4 writeback window otherwise zeroes the just-written files.
sync

# ── 4. Deploy the native layer via update-station ─────────────────────────────
# The checkout above landed the NEW update-station + hooks on disk, so this runs
# the new logic: post-merge.sh → install-native (fetch pinned armhf binaries),
# install-systemd (deploy + enable units, purge retired ones via REMOVED),
# install-udev, install-network — plus npm install (if changed) and service
# restarts. Its internal `git pull --ff-only` is a no-op (we're at the branch tip).
log "running update-station to deploy the native layer"
bash "$REPO/system/scripts/update-station.sh" || die "update-station failed"

# ── 5. Known OS-package delta (best-effort) ───────────────────────────────────
# The prepared image had `jq` installed (and a full apt upgrade this path does NOT
# reproduce). Patch the one package 2.0.0 tooling may come to rely on; non-fatal.
# Full OS parity still requires a reflash.
if ! command -v jq >/dev/null 2>&1; then
  log "installing jq (known OS-package delta), best-effort"
  apt-get install -y jq >/dev/null 2>&1 || log "WARN: jq install failed (stale apt lists / no network) — install manually if needed"
fi

# ── 6. Reboot to converge ─────────────────────────────────────────────────────
# Newly-enabled native daemons are enabled but not yet started (enable != start),
# and ctt-device-config applies the canonical /boot/config.txt on boot. The first
# reboot starts the daemons + runs ctt-device-config, which copies config.txt and
# reboots ONCE more (its hash-keyed loop breaker prevents further reboots) to load
# the device-tree overlays. Two reboots total to fully converge.
sync
log "native layer deployed; rebooting to converge (ctt-device-config reboots once more)"
reboot

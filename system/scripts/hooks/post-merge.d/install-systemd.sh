#!/bin/bash
# CTT OTA hook: deploy systemd unit files from the monorepo.
#
# Source: $REPO/system/systemd/*.service and *.timer (default REPO=/usr/lib/ctt/sensor-station-software)
# Dest:   /etc/systemd/system/  (root:root mode 0644)
#
# Source filenames pass through unchanged. Replaces any pre-existing
# file or symlink at the destination with a regular file copy (no more
# symlinks-into-the-monorepo) — see _lib.sh deploy_dir + install(1)
# semantics: install replaces symlinks at the destination with the
# source content, leaving a real file. This gives us unambiguous state
# in /etc/systemd/system/ that is independent of monorepo path changes.
#
# Reload: systemctl daemon-reload (only when something changed)
# Auto-enable: any unit listed in MUST_BE_ENABLED that isn't currently
# enabled is enabled via `systemctl enable`. Units the user has
# explicitly disabled (state "disabled") are left alone so their
# operational choice isn't overridden by an OTA.
#
# Must run as root: install -o root, systemctl writes to /etc/systemd/

set -e

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

REPO="${REPO:-/usr/lib/ctt/sensor-station-software}"
SRC_DIR="$REPO/system/systemd"
DST_DIR="/etc/systemd/system"

# Units that should always be enabled if present. Add new names here
# as services join the OTA-deploy story. Units NOT listed here are
# only deployed as files — their enable state is left to manufacturing
# / Ansible / operator action.
MUST_BE_ENABLED=(
  ctt-firstboot-resize.service   # fail-safe, stateless first-boot rootfs expand (grow partition + resize2fs in one pass, no reboot); replaces init_resize, whose reboot-based fs-grow never completes on the CTT image
  modem-boot-state.service       # state persistence (Meelyn's), runs Before MM
  ctt-board-detect.service         # boot-time hardware identity; writes /run/ctt/board.env
  ctt-device-config.service      # single owner of config.txt: copies the canonical per-revision file (RTC + buttons + LEDs), loop-safe. Replaces the old rtc/buttons/leds overlay services.
  ctt-sensors.service            # I2C ADC + temp reader -> /run/ctt/sensors.json
  ctt-leds.service               # status LED driver (SX1509B) <- /run/ctt/leds
  ctt-lcd.service                # character LCD driver (HD44780/PCF8574) <- /run/ctt/lcd
  ctt-modem-wake.service         # wake a shut-down Telit at boot (ON_OFF# pulse) so a hard reset self-recovers; runs Before modem-boot-state
  ctt-modem-provision.service    # idempotent ECM provision GUARD; Before MM, no-op on a provisioned modem, converts a fresh/swapped RNDIS one
  ctt-modem-ecm-up.service       # bring up the ECM data iface mdm0 (DHCP + fallback route); NM won't manage an MM modem net port
  ctt-modem-ecm-up.timer         # 5-min re-assert of the ECM data path: catches a datapath that dies with NO re-enumeration (so no udev add event to trigger recovery)

  # Application layer (Node services + SensorGnome). Enable here so an OTA self-heals
  # a lost symlink and an image built without the legacy Ansible enablement still comes
  # up with a full app layer — previously these were deployed as files only and their
  # enable state depended solely on Ansible / manufacturing.
  station-hardware-server.service  # REST hardware API :3000 (the other station-* units order after it)
  station-radio-interface.service  # radio acquisition + pipeline, WS :8001
  station-web-interface.service    # dashboard :80
  station-lcd-interface.service    # LCD menu + buttons
  station-boot.service             # modem data-path policy + per-SIM APN (oneshot, After ModemManager)
  bootcount.service                # writes /etc/bootcount (SensorGnome reads it at load) + SG hub-map symlink
  sensorgnome.service              # SG master :3010 (tag detection)

  # ctt-radio-driver@.service and ctt-blu-driver@.service are TEMPLATES — udev
  # activates per-channel instances via ENV{SYSTEMD_WANTS}; they are deployed as
  # files but must NOT be enabled here.
  #
  # ctt-modem-reassert-off.service is likewise udev-activated only (mdm0 add rule in
  # 78-ctt-telit-net.rules) and has no [Install]; deployed as a file, never enabled.
)
# NOTE: ctt-modem-provision.service is an idempotent boot GUARD, not an every-boot
# re-provisioner. It reads AT#USBCFG?/AT#ECM? and only writes when a modem is not
# already ECM + bound. ECM provisioning (composition AT#USBCFG=1 + session bind
# AT#ECM=1,0) is NV-persistent — survives reboots AND hard power cycles (verified fw
# M0Y.300002) — so on a provisioned modem the guard is a read-and-exit no-op; on a
# fresh/swapped RNDIS modem (ships 1bc7:7020) it converts it (USBCFG=1 + reboot, then
# ECM=1,0 on the next boot), so there is NO manual provision step. It runs Before
# ModemManager for exclusive AT-port access — no MM/NM shutdown, so no races. The HOST
# side is NOT auto-configured by NetworkManager (NM folds the ECM net port into the MM
# modem and never DHCPs mdm0), so ctt-modem-ecm-up.service brings mdm0 up via DHCP with a
# fallback route each boot. ctt-modem-wake only powers the modem ON after a hard reset.

CHANGED=0

install_if_diff() {
  local src="$1" dst="$2"
  [ -f "$src" ] || return
  # install(1) replaces symlinks at $dst with regular file containing $src.
  # We compare content rather than file type to decide whether to install.
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
    return
  fi
  install -o root -g root -m 644 "$src" "$dst"
  log_info "installed $dst"
  CHANGED=1
}

if [ ! -d "$SRC_DIR" ]; then
  log_warn "source dir not found: $SRC_DIR (skipping systemd deploy)"
  exit 0
fi

# Deploy *.service and *.timer files (could extend to .socket etc. later).
# .timer was added for ctt-modem-ecm-up.timer — before that this glob was
# *.service only, so a timer dropped in system/systemd/ silently never deployed.
for src in "$SRC_DIR"/*.service "$SRC_DIR"/*.timer; do
  [ -f "$src" ] || continue
  install_if_diff "$src" "$DST_DIR/$(basename "$src")"
done

# Propagate retired units (renamed or removed in source, listed in
# $SRC_DIR/REMOVED) — disable+stop first so no dangling enablement symlinks are
# left, then remove the unit file. Without this, a renamed unit (e.g.
# ctt-station-id.service -> ctt-board-detect.service) would linger and could
# still be started.
_systemd_remover() {
  systemctl disable --now "$2" >/dev/null 2>&1 || true
  rm -f "$1/$2"
}
apply_removals "$SRC_DIR" "$DST_DIR" _systemd_remover
[ "${REMOVED_COUNT:-0}" -gt 0 ] && CHANGED=1

if [ "$CHANGED" = "1" ]; then
  log_info "reloading systemd"
  systemctl daemon-reload
else
  log_info "no systemd unit changes"
fi

# Enable required units. These are MUST_BE_ENABLED by definition, so a
# freshly-deployed unit (which systemd reports as "disabled" until enabled)
# DOES get enabled — otherwise the provisioning/boot units would never start
# on a fresh fleet station. An operator who wants one off should remove it
# from MUST_BE_ENABLED, not rely on a runtime `disable` surviving OTA.
for unit in "${MUST_BE_ENABLED[@]}"; do
  if [ ! -f "$DST_DIR/$unit" ]; then
    log_warn "$unit listed in MUST_BE_ENABLED but not installed; skipping enable"
    continue
  fi
  state=$(systemctl is-enabled "$unit" 2>&1 || true)
  case "$state" in
    enabled|enabled-runtime|alias|static)
      # already in good state
      ;;
    *)
      log_info "enabling $unit (was: $state)"
      systemctl enable "$unit"
      ;;
  esac
done

exit 0

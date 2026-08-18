#!/bin/bash
# CTT OTA hook: install prebuilt out-of-tree kernel modules for the running kernel.
#
# Source: $REPO/system/modules/$(uname -r)/*.ko.xz  (default REPO=/usr/lib/ctt/sensor-station-software)
# Dest:   /lib/modules/$(uname -r)/updates/         (root:root mode 0644)
# Reload: depmod -a when anything changed, then modprobe what is not yet loaded
#
# Modules are keyed by KERNEL RELEASE, not by semver: a module only loads into
# the exact kernel it was compiled against (vermagic), so 6.1.21-v8+ and
# 6.1.21-v7+ need separate builds. A running kernel with no directory here gets
# nothing, which is normal and not an error.
#
# Stations never compile these -- they have a 32-bit userspace and no v8+
# headers. They are cross-built off-station by system/modules/build-8821cu.sh
# and committed. See system/modules/README.md and wifi-8821cu-cm4s.md.

set -e

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

REPO="${REPO:-/usr/lib/ctt/sensor-station-software}"
KREL="$(uname -r)"
SRC_DIR="$REPO/system/modules/$KREL"
DST_DIR="/lib/modules/$KREL/updates"

if [ ! -d "$SRC_DIR" ]; then
  log_info "no prebuilt modules for kernel $KREL (nothing to do)"
  exit 0
fi

shopt -s nullglob
modules=("$SRC_DIR"/*.ko.xz "$SRC_DIR"/*.ko)
if [ ${#modules[@]} -eq 0 ]; then
  log_info "no module files under $SRC_DIR"
  exit 0
fi

# Refuse to install a corrupt artifact: a truncated .ko wedges modprobe.
if [ -f "$SRC_DIR/SHA256SUMS" ]; then
  if ! ( cd "$SRC_DIR" && sha256sum -c --quiet SHA256SUMS ); then
    log_error "checksum mismatch in $SRC_DIR; refusing to install"
    exit 1
  fi
else
  log_warn "$SRC_DIR has no SHA256SUMS; installing unverified"
fi

CHANGED=0
for src in "${modules[@]}"; do
  name="$(basename "$src")"
  dst="$DST_DIR/$name"
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
    log_info "$name already current"
    continue
  fi
  install -D -m 0644 "$src" "$dst"
  log_info "installed $name -> $dst"
  CHANGED=1
done

if [ "$CHANGED" -eq 1 ]; then
  log_info "running depmod for $KREL"
  depmod -a "$KREL" || log_warn "depmod failed"
fi

# Load anything not yet loaded. An operator who ran disable-wifi.sh has a
# blacklist file for that module, so honour it -- an explicit modprobe by name
# would override the blacklist, which is not what "disabled" should mean.
for src in "${modules[@]}"; do
  mod="$(basename "$src")"; mod="${mod%.ko.xz}"; mod="${mod%.ko}"
  if lsmod | awk '{print $1}' | grep -qx "$mod"; then
    continue
  fi
  if grep -rqs "^blacklist[[:space:]]\+$mod\b" /etc/modprobe.d/; then
    log_info "$mod is blacklisted by operator choice; not loading"
    continue
  fi
  if modprobe "$mod" 2>/dev/null; then
    log_info "loaded $mod"
  else
    log_warn "modprobe $mod failed"
  fi
done

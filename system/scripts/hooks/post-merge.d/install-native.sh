#!/bin/bash
# CTT OTA hook: install the pinned native (C++) tool binaries.
#
# For each pin file $REPO/system/native/<tool>.version (bare semver), fetch the
# matching prebuilt armhf binary from the monorepo's GitHub releases and install
# it to /usr/local/bin/<tool> (the path the systemd units' ExecStart points at).
# Stations FETCH binaries; they never compile.
#
# Release contract (see system/native/README.md): for pin X.Y.Z of <tool>,
#   .../releases/download/<tool>-vX.Y.Z/<tool>-X.Y.Z-armhf
# and, preferred, a sibling <tool>-X.Y.Z-armhf.sha256. The binary's
# `<tool> --version` MUST print exactly X.Y.Z.
#
# Idempotent: a tool already at its pinned version is skipped. A transient
# download failure leaves any existing binary in place and is retried on the
# next OTA (non-fatal); a tool with no usable binary at all is a hard failure.
#
# Single platform today: Pi CM3+ is armhf. If a 64-bit board (e.g. CM4/arm64)
# joins the fleet, switch ARCH to `dpkg --print-architecture` and publish a
# per-arch asset.

set -u

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

REPO="${REPO:-/usr/lib/ctt/sensor-station-software}"
PINS_DIR="$REPO/system/native"
BIN_DIR="/usr/local/bin"
GH_REPO="cellular-tracking-technologies/sensor-station-software"
RELEASE_BASE="https://github.com/$GH_REPO/releases/download"
ARCH="armhf"

if [ ! -d "$PINS_DIR" ]; then
  log_warn "no pins dir at $PINS_DIR (skipping native install)"
  exit 0
fi

# Per-tool post-install action. Default: nothing (the unit reapplies the new
# binary on its next start / next boot). ctt-radio-driver runs as long-lived
# per-channel instances, so restart the ones currently running.
post_install() {
  local tool="$1"
  case "$tool" in
    ctt-radio-driver)
      local units
      units="$(systemctl list-units --state=running 'ctt-radio-driver@*' \
                 --no-legend 2>/dev/null | awk '{print $1}')"
      if [ -n "$units" ]; then
        log_info "restarting $units"
        systemctl restart $units || log_warn "restart of $units failed"
      fi
      ;;
    *) : ;;  # ctt-station-id et al.: oneshot, reapplied next boot
  esac
}

FAILURES=0
INSTALLED=0

shopt -s nullglob
for pinfile in "$PINS_DIR"/*.version; do
  tool="$(basename "$pinfile" .version)"
  pin="$(tr -d '[:space:]' < "$pinfile")"
  dst="$BIN_DIR/$tool"

  if [ -z "$pin" ]; then
    log_warn "$tool: empty pin in $pinfile; skipping"
    continue
  fi
  if ! [[ "$pin" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    log_warn "$tool: pin '$pin' is not a semver; skipping"
    continue
  fi

  # Already at the pinned version?
  if [ -x "$dst" ] && [ "$("$dst" --version 2>/dev/null)" = "$pin" ]; then
    log_info "$tool already at $pin"
    continue
  fi

  asset="$tool-$pin-$ARCH"
  url="$RELEASE_BASE/$tool-v$pin/$asset"
  tmp="$(mktemp)"

  log_info "$tool: fetching $pin (have: $([ -x "$dst" ] && "$dst" --version 2>/dev/null || echo none))"
  if ! curl -fsSL --retry 3 --retry-delay 2 -o "$tmp" "$url"; then
    rm -f "$tmp"
    if [ -x "$dst" ]; then
      log_warn "$tool: download failed ($url); keeping existing binary, will retry next OTA"
    else
      log_error "$tool: download failed ($url) and no binary installed"
      FAILURES=$((FAILURES + 1))
    fi
    continue
  fi

  # Optional checksum verification (preferred). Absent sidecar → fall back to
  # the --version smoke test below.
  sum_tmp="$(mktemp)"
  if curl -fsSL --retry 2 -o "$sum_tmp" "$url.sha256" 2>/dev/null; then
    expected="$(awk '{print $1}' "$sum_tmp")"
    actual="$(sha256sum "$tmp" | awk '{print $1}')"
    if [ "$expected" != "$actual" ]; then
      log_error "$tool: checksum mismatch (expected $expected, got $actual); not installing"
      rm -f "$tmp" "$sum_tmp"
      FAILURES=$((FAILURES + 1))
      continue
    fi
    log_info "$tool: checksum ok"
  else
    log_warn "$tool: no .sha256 published; relying on --version smoke test"
  fi
  rm -f "$sum_tmp"

  # Smoke test: the fetched binary must run on this host and report the pin.
  # Catches wrong-arch / truncated downloads that still returned HTTP 200.
  chmod 0755 "$tmp"
  got="$("$tmp" --version 2>/dev/null)"
  if [ "$got" != "$pin" ]; then
    log_error "$tool: fetched binary reports '$got', expected '$pin'; not installing"
    rm -f "$tmp"
    FAILURES=$((FAILURES + 1))
    continue
  fi

  install -o root -g root -m 0755 "$tmp" "$dst"
  rm -f "$tmp"
  log_info "$tool: installed $pin -> $dst"
  INSTALLED=$((INSTALLED + 1))
  post_install "$tool"
done

[ "$INSTALLED" = 0 ] && [ "$FAILURES" = 0 ] && log_info "all native tools at pinned versions"

if [ "$FAILURES" -gt 0 ]; then
  log_error "$FAILURES native tool(s) failed to install"
  exit 1
fi
exit 0

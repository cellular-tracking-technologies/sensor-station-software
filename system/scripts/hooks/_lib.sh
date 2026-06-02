# CTT OTA hook shared library — sourced by hook scripts.
#
# Provides:
#   - log_info / log_warn / log_error    consistent prefix + severity format
#   - require_root                        guard helper
#   - deploy_dir                          generic file-into-/etc/ deploy
#                                         with idempotency + optional reload
#
# Log format:
#
#   [post-merge]         INFO  running install-network.sh
#   [install-network]    INFO  installed /etc/NetworkManager/system-connections/wired-con.nmconnection
#   [install-udev]       WARN  source dir not found: /usr/lib/ctt/sensor-station-software/system/udev
#   [post-merge]         ERROR install-udev.sh exited 1
#
# INFO → stdout, WARN/ERROR → stderr. The orchestrator captures both
# streams, and the calling systemd unit (station-hardware-server) routes
# them into the journal.
#
# Sourcing:
#   - From a hook in post-merge.d/: orchestrator exports CTT_HOOK_LIB; the
#     hook sources via ${CTT_HOOK_LIB:-<fallback ../_lib.sh>}.
#   - Standalone (manual invocation): the fallback resolves via $0's dir.
# The leading underscore in this filename keeps it out of post-merge.d/*.sh
# globs, so it won't be executed as a hook by accident.

# Derive the tag from the sourcing script's filename. Allow override via
# the TAG env var if a script wants something other than its basename.
TAG="${TAG:-$(basename "${BASH_SOURCE[1]:-$0}" .sh)}"

log_info()  { printf '[%s] INFO  %s\n' "$TAG" "$*"; }
log_warn()  { printf '[%s] WARN  %s\n' "$TAG" "$*" >&2; }
log_error() { printf '[%s] ERROR %s\n' "$TAG" "$*" >&2; }

# Refuse to run if not invoked as root.
require_root() {
  if [ "$EUID" -ne 0 ]; then
    log_error "must run as root"
    exit 1
  fi
}

# Generic deploy: walk a source dir for files matching $glob, install each
# to $dst_dir if the destination is missing or content-differs, then run
# $reload_cmd if anything changed.
#
# Args:
#   $1 src_dir       directory of source files (e.g. "$REPO/system/network")
#   $2 dst_dir       /etc/ destination          (e.g. "/etc/NetworkManager/system-connections")
#   $3 glob          shell glob for source files (e.g. "*.nmconnection")
#   $4 mode          octal mode for installed file (e.g. 600)
#   $5 mutable_keys  egrep pattern of source-vs-dest lines to STRIP before
#                    diffing. Use this for files where a runtime agent
#                    rewrites certain keys (NM timestamp=, check-sim-id
#                    apn=) and we don't want to fight it. Empty string ""
#                    falls back to plain `cmp -s`.
#   $6 reload_cmd    command line to run if anything changed, or "" to skip
#
# All installs use install(1) with root:root ownership. Caller is
# expected to have already invoked require_root.
deploy_dir() {
  local src_dir="$1" dst_dir="$2" glob="$3" mode="$4" mutable_keys="$5" reload_cmd="$6"
  local changed=0

  if [ ! -d "$src_dir" ]; then
    log_warn "source dir not found: $src_dir (skipping deploy)"
    return 0
  fi

  for src in "$src_dir"/$glob; do
    [ -f "$src" ] || continue
    local dst="$dst_dir/$(basename "$src")"

    if [ -f "$dst" ]; then
      if [ -n "$mutable_keys" ]; then
        # Strip mutable lines from both sides before diffing.
        if diff -q <(grep -vE "$mutable_keys" "$src") \
                   <(grep -vE "$mutable_keys" "$dst") >/dev/null 2>&1; then
          continue
        fi
      else
        if cmp -s "$src" "$dst"; then
          continue
        fi
      fi
    fi

    install -o root -g root -m "$mode" "$src" "$dst"
    log_info "installed $dst"
    changed=1
  done

  if [ "$changed" = "1" ] && [ -n "$reload_cmd" ]; then
    log_info "reloading via: $reload_cmd"
    $reload_cmd
  elif [ "$changed" = "0" ]; then
    log_info "no changes"
  fi
}

#!/bin/bash
# CTT OTA orchestrator: runs every executable script under post-merge.d/
# in lexical order. Called by update-station.sh after `git pull`.
#
# Layout:
#   hooks/
#     _lib.sh          ← shared log helpers (sourced by hooks via CTT_HOOK_LIB)
#     post-merge.sh    ← this orchestrator
#     post-merge.d/    ← drop new install-*.sh / NN-*.sh here, no rename or
#                        wiring required; lexical order controls run order
#
# Adding a new subsystem deploy (systemd units, chrony config, etc.) is
# a matter of dropping a new *.sh into post-merge.d/. No edit to this
# orchestrator or to update-station.sh required. That keeps the OTA
# updater stable across releases and avoids the "first-OTA needs two
# runs" problem we'd otherwise hit every time we added a hook.
#
# Each hook is independent:
#   - manages one subsystem
#   - checks its own permission requirements (must run as root)
#   - compares source vs dest and only writes when they differ
#   - reloads its subsystem only when something actually changed
#
# Failure isolation: one failing hook does not block the others. The
# orchestrator's overall exit code is non-zero if any hook failed, so
# the caller can detect partial-failure conditions.
#
# Must run as root: the individual hooks need root for /etc/* writes
# and for nmcli/udevadm reloads.

HOOKS_DIR="$(dirname "$(readlink -f "$0")")"
source "$HOOKS_DIR/_lib.sh"
require_root

# Export the lib path so hooks can source it via a stable env var. They
# fall back to a relative path when invoked manually outside the
# orchestrator (see _lib.sh sourcing in each hook for the fallback).
export CTT_HOOK_LIB="$HOOKS_DIR/_lib.sh"

HOOK_DROPIN="$HOOKS_DIR/post-merge.d"
FAILURES=0
RAN=0

if [ ! -d "$HOOK_DROPIN" ]; then
  log_warn "no hook drop-in directory at $HOOK_DROPIN; nothing to run"
  exit 0
fi

# Run every *.sh in post-merge.d/ in lexical order. Use numeric prefixes
# (10-foo.sh, 20-bar.sh) only when a specific order matters.
for hook in "$HOOK_DROPIN"/*.sh; do
  [ -f "$hook" ] || continue
  name="$(basename "$hook")"
  log_info "running $name"
  bash "$hook"
  rc=$?
  RAN=$((RAN + 1))
  if [ $rc -ne 0 ]; then
    log_error "$name exited $rc"
    FAILURES=$((FAILURES + 1))
  fi
done

if [ $FAILURES -gt 0 ]; then
  log_error "$FAILURES of $RAN hook(s) failed"
  exit 1
fi
log_info "$RAN hook(s) completed cleanly"
exit 0

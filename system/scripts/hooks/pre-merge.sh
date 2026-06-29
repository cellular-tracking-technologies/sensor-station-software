#!/bin/bash
# CTT OTA orchestrator: runs every executable script under pre-merge.d/
# in lexical order. Called by update-station.sh BEFORE `git pull`.
#
# Symmetric to post-merge.sh, just with a different drop-in dir. The
# split exists so we have a clear home for work that must happen BEFORE
# new code lands on disk — e.g.:
#   - capturing pre-update state (snapshots, version stamps) for diff
#   - stopping a service that needs a clean shutdown before its unit
#     file or binary is replaced
#   - schema/migration prep that the new code expects already done
#
# Note on first-run semantics: pre-merge.sh runs the version of itself
# AND of pre-merge.d/ that already exists on disk. New pre-merge hooks
# added in a release do NOT take effect on the OTA that introduces them
# — they activate on the NEXT update. (Post-merge hooks don't have this
# constraint, since they run after the pull that delivers them.) Plan
# pre-merge work accordingly.
#
# Layout mirrors post-merge.sh — see that file for the broader rationale.
#
# Drop-in dir is currently empty (placeholder phase). The orchestrator
# logs that it ran so the OTA journal carries an unambiguous record of
# the pre-merge step firing even when no hooks are installed yet.
#
# Failure isolation: one failing hook does not block the others. The
# orchestrator's overall exit code is non-zero if any hook failed.

HOOKS_DIR="$(dirname "$(readlink -f "$0")")"
source "$HOOKS_DIR/_lib.sh"
require_root

export CTT_HOOK_LIB="$HOOKS_DIR/_lib.sh"

HOOK_DROPIN="$HOOKS_DIR/pre-merge.d"
FAILURES=0
RAN=0

if [ ! -d "$HOOK_DROPIN" ]; then
  log_info "no pre-merge.d/ directory present; nothing to run"
  exit 0
fi

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

if [ $RAN -eq 0 ]; then
  log_info "no pre-merge hooks present (placeholder phase)"
  exit 0
fi

if [ $FAILURES -gt 0 ]; then
  log_error "$FAILURES of $RAN hook(s) failed"
  exit 1
fi
log_info "$RAN hook(s) completed cleanly"
exit 0

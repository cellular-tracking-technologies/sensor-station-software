#!/bin/bash
# CTT OTA hook: deploy logrotate configs.
#
# Source: $REPO/system/logrotate/*  (default REPO=/usr/lib/ctt/sensor-station-software)
# Dest:   /etc/logrotate.d/  (root:root mode 0644)
# Reload: none needed — logrotate is not a daemon; it re-reads /etc/logrotate.d on
#         every run (Debian: the daily cron/timer job), so a deployed file is live
#         at the next rotation with no reload step.
#
# Source filenames pass through unchanged. Name them WITHOUT an extension, matching
# the convention every other file in /etc/logrotate.d follows (apt, chrony, rsyslog,
# ...) — logrotate skips a set of "taboo" extensions and an extension-less name
# sidesteps the question entirely.
#
# Deployed as a regular file, not a symlink into the monorepo: logrotate configs are
# read as root and an unambiguous /etc copy keeps them independent of repo layout.

set -e

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

deploy_dir \
  "${REPO:-/usr/lib/ctt/sensor-station-software}/system/logrotate" \
  /etc/logrotate.d \
  '*' \
  644 \
  '' \
  ''

#!/bin/bash
# Make git usable no matter who invokes us. update-station runs from three
# contexts: an interactive `ctt` SSH shell, cron (bash-update-station), and the
# station-radio-interface service — which runs as ROOT with no $HOME (the web
# dashboard's "update" button spawns us there). Two problems follow in that
# rootless-$HOME context:
#   1. `git config --global` fails ("fatal: $HOME not set"), so the safe.directory
#      exception below is never recorded.
#   2. We chown the checkout to ctt:ctt while git runs as root, so git's
#      dubious-ownership guard rejects every operation ("detected dubious
#      ownership ... /usr/lib/ctt/sensor-station-software").
# Fix both up front: ensure $HOME exists, and inject safe.directory via the
# environment (inherited by the hooks + the sensorgnome pull) so it does not
# depend on a writable global config.
export HOME="${HOME:-/root}"
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0='safe.directory'
export GIT_CONFIG_VALUE_0='*'

home='/usr/lib/ctt'
user_perm='ctt:ctt'
sudo mkdir -p $home
cd $home
git_url='https://github.com/cellular-tracking-technologies/sensor-station-software.git'

check_run() {
  echo "$changed_files" | grep --quiet "$1" && eval "$2"
}

dir="$home/sensor-station-software"

# Front-panel LCD: show an "Updating" splash for the whole update, then restore
# the menu when we exit. station-lcd-interface is stopped so it won't repaint the
# menu over the splash; the native ctt-lcd daemon keeps rendering the framebuffer
# we write. The EXIT trap restores the menu on ANY exit (success, error, or a
# Ctrl-C), so the panel never gets stuck on "Updating". lcd-message.sh ships in
# this repo, so the splash is a harmless no-op on the first update that adds it.
lcd_msg="$dir/system/scripts/lcd-message.sh"
if [ -x "$lcd_msg" ]; then
  trap 'sudo systemctl restart station-lcd-interface >/dev/null 2>&1 || true' EXIT
  sudo systemctl stop station-lcd-interface >/dev/null 2>&1 || true
  sudo bash "$lcd_msg" " CTT Sensor Station" "" "   Updating..." "" || true
fi

# change permissions to ctt user to be safe
sudo chown -R $user_perm $dir
# check if the software directory exists
if [ -d $dir ]; then
  # directory exists - stash any changes and do a git pull
  cd $dir
  git config --global --add safe.directory $dir
  git stash
  # Pre-merge orchestrator runs before the pull. Mirror of post-merge.sh
  # with its own pre-merge.d/ drop-in dir. Currently a placeholder — no
  # hooks installed yet, the orchestrator just logs that it ran. Note
  # that the pre-merge.sh executed here is the version ALREADY on disk,
  # not the one being pulled; new pre-merge hooks activate on the NEXT
  # update after their introducing release lands. See pre-merge.sh.
  if [ -x "$dir/system/scripts/hooks/pre-merge.sh" ]; then
    sudo bash "$dir/system/scripts/hooks/pre-merge.sh"
  fi
  # The pull must be authoritative: this script has no `set -e`, so a silent pull
  # failure (transient network / DNS / GitHub blip) would otherwise let the rest
  # of the update run against the OLD code and still print "UPDATE COMPLETE" — a
  # remote station would look updated but not be. Retry transient failures,
  # use --ff-only (no accidental merge commits / no hang on divergence), and
  # ABORT loudly + non-zero if it ultimately fails (the EXIT trap restores the
  # LCD menu). git stash above leaves the tree clean so --ff-only can proceed.
  before="$(git rev-parse HEAD)"
  pulled=0
  for attempt in 1 2 3; do
    if git pull --ff-only; then pulled=1; break; fi
    echo "update-station: git pull failed (attempt $attempt/3); retrying in 5s..."
    sleep 5
  done
  if [ "$pulled" != 1 ]; then
    echo "update-station: ERROR — git pull failed after retries; staying on ${before:0:12}, NOT marking update complete"
    exit 1
  fi
  # change permissions to ctt user after pull to be sure all files have same permissions
  sudo chown -R $user_perm $dir
  # Durability barrier: force the freshly-pulled git objects + checked-out files
  # to disk NOW. ext4 (data=ordered) journals metadata on its ~5s commit but the
  # file DATA waits in the page cache until writeback; a hard power-cut in that
  # window lets journal recovery TRUNCATE the just-written files to zero bytes.
  # We have seen exactly this: an OTA immediately followed by a hard power-off
  # blanked the whole checkout (and git objects + stash), bricking the node app
  # on next boot. sync flushes the page cache so the new code survives a cut.
  sync
  # checking if package.json has changed (use the captured pre-pull HEAD, not
  # ORIG_HEAD which a no-op --ff-only pull leaves pointing at a previous merge)
  changed_files="$(git diff-tree -r --name-only --no-commit-id "$before" HEAD)"
  check_run package.json "npm install"
  # If update-station.sh itself was changed by this pull, re-exec the new
  # version so any newly-added deploy logic (hooks, env vars, etc.) runs in
  # the SAME OTA run rather than only on the NEXT update. The _OTA_REEXECED
  # guard prevents an infinite re-exec loop on the second pass.
  if [ -z "$_OTA_REEXECED" ] && echo "$changed_files" | grep -q "^system/scripts/update-station.sh$"; then
    echo "update-station.sh changed; re-executing new version to apply new deploy logic"
    export _OTA_REEXECED=1
    exec bash "$dir/system/scripts/update-station.sh" "$@"
  fi
else
  cd $home
  echo "cloning sensor-station-software repo to $dir"
  git clone $git_url
  cd $dir
  npm install
fi

# Run the OTA hook orchestrator. It iterates every install-*.sh under
# system/scripts/hooks/, so adding a new subsystem deploy (systemd
# units, chrony config, etc.) is just a matter of dropping a new hook
# file into that dir — this line stays unchanged. Runs for both the
# update path (git pull) and the fresh-clone path so a freshly-cloned
# repo also deploys its configs into /etc/.
sudo bash $dir/system/scripts/hooks/post-merge.sh

sudo sh -c "date -u +'%Y-%m-%d %H:%M:%S' > /etc/ctt/station-software"

# Durability barrier (see the sync after the pull): flush the hooks' /etc installs
# (udev rules, systemd units), any native binaries install-native fetched, and the
# version stamp to disk before we restart services, so a power-cut right after the
# update can't zero them on the next boot.
sync

# Board identity (/etc/ctt/station-* + /run/ctt/board.env) is written at boot by
# the native ctt-board-detect.service; the old in-process initialize.js step is
# no longer needed here.

echo '*******************************************'
echo 'CTT Sensor Station Software Update Complete'
echo '*******************************************'

sudo systemctl restart station-hardware-server
sudo systemctl restart station-web-interface
# station-lcd-interface is intentionally NOT restarted here — it stays stopped so
# the "Updating" splash remains on the panel through the rest of the update; it is
# restored near the end (or by the EXIT trap on any earlier failure path).
# station-radio-interface is intentionally NOT restarted here either: when the
# update is launched from the web dashboard this script runs as a CHILD of that
# service, so restarting it now tears down our cgroup and SIGKILLs us mid-update
# (frozen "Updating" splash, skipped sensorgnome + image-OTA). It is restarted
# LAST, once all real work is done — see the end of this script.

echo '********************'
echo 'Updating Sensorgnome'
echo '********************'

# pull sensorgnome code updates
dir="$home/sensorgnome/sensorgnome"
# change user permissions of sensorgnome directory to be safe
sudo chown -R $user_perm $dir
cd $dir
git config --global --add safe.directory /usr/lib/ctt/sensor-station-software
git stash
git pull
sudo chown -R $user_perm $dir
git config --global --add safe.directory $dir
changed_files="$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD)"
check_run package.json "npm install"
# Durability barrier (see the sync after the sensor-station-software pull): flush
# the freshly-pulled sensorgnome code before restarting it.
sync
sudo systemctl restart sensorgnome

echo
echo 'Checking for OTA updates'
bash-update-station
echo

# Update finished — restore the front-panel menu (picks up any new code) and
# clear the trap now that we've restored explicitly. The trap remains the safety
# net for any earlier failure path above.
sudo systemctl restart station-lcd-interface
trap - EXIT

echo
echo '***********************'
echo 'STATION UPDATE COMPLETE'
echo '***********************'

# LAST action, deliberately after everything above. When the update is launched
# from the web dashboard, station-radio-interface is the service hosting this
# script, so restarting it tears down the service cgroup and SIGKILLs us. Doing it
# here means all real work (code pull, hooks, sensorgnome, image OTA, LCD restore)
# is already done, so losing the process now is harmless; systemd still carries out
# the enqueued restart after the requesting process dies. (Run from SSH/cron we are
# not a child of the service, so this is just an ordinary restart.)
sudo systemctl restart station-radio-interface
#!/bin/bash
# modem-ecm-up.sh — bring up the Telit CDC-ECM data interface (mdm0) via DHCP.
#
# Follows the Telit AT reference (#ECM): activating the ECM session reloads the USB
# driver so the host "broadcasts DHCP" — the module runs a DHCP server at
# 192.168.225.1 and leases the host 192.168.225.2. We use that documented DHCP
# handshake rather than a hard-coded static address.
#
# Why a dedicated service (not NetworkManager): in the ECM composition ModemManager
# owns the modem (we need it for signal / registration / ICCID via mmcli), and NM
# folds mdm0 into that single "modem" device — `nmcli device` never lists mdm0, so
# NM never DHCPs it. We configure it out of band.
#
# Route safety: dhclient installs a metric-0 default via the module, which would
# PREEMPT eth0/wlan0. We re-pin it to a HIGH fallback metric so cellular is used
# only when no wired/WiFi default has a route.
#
# Idempotent; fails open (exit 0) when mdm0 is absent (modem off/disabled/non-Telit)
# so it never blocks boot.
set -u

IFACE=mdm0
METRIC=700   # > eth0 (~50) and wlan0 (~600): cellular is fallback-only

# Persistent operator intent (disable-modem.sh writes it, enable-modem.sh clears it).
# Also enforced as ConditionPathExists in ctt-modem-ecm-up.service; repeated here
# because this script is invoked directly too (OTA post-merge, operator shell), where
# the unit condition does not apply. Checked BEFORE the wait loop so a station with
# the modem deliberately off does not burn 20 s on every timer tick.
if [ -e /etc/ctt/modem-disabled ]; then
  echo "modem-ecm-up: /etc/ctt/modem-disabled present — operator intent is OFF; nothing to do"
  exit 0
fi

# Serialize invocations. systemd already prevents two runs of the oneshot unit from
# overlapping, so the udev trigger and the timer cannot collide — but this script is
# ALSO run directly, outside the unit (OTA post-merge hook, operator shell), and those
# paths bypass that guarantee. Two concurrent runs would share one pidfile and race
# `dhclient -x` against a `dhclient` that is still coming up, leaving the lease state
# ambiguous. Non-blocking: if another instance holds the lock it is already doing this
# exact work, so there is nothing for us to add. Fail open, like every other exit here.
# The writability test is not ceremony: a failed `exec` redirection kills a
# non-interactive shell outright, which would turn a missing lock dir into a station
# that cannot recover its data path. Test first, and run unguarded rather than not at
# all — the lock is an optimisation, the bring-up is the point.
LOCKDIR=/run/lock
mkdir -p "$LOCKDIR" 2>/dev/null || true
if [ -w "$LOCKDIR" ]; then
  exec 9>"$LOCKDIR/modem-ecm-up.lock"
  if ! flock -n 9; then
    echo "modem-ecm-up: another instance is already bringing up $IFACE; nothing to do"
    exit 0
  fi
else
  echo "modem-ecm-up: $LOCKDIR not writable — proceeding without the concurrency guard"
fi

# Wait (bounded) for the ECM netdev, renamed from the cdc_ether port by
# 78-ctt-telit-net.rules. Absent = modem off/disabled/non-Telit -> nothing to do.
for _ in $(seq 1 20); do
  [ -e "/sys/class/net/$IFACE" ] && break
  sleep 1
done
if [ ! -e "/sys/class/net/$IFACE" ]; then
  echo "modem-ecm-up: $IFACE not present — modem off/disabled or not ECM; nothing to do"
  exit 0
fi

# Already configured? Nothing to do. This script now runs on every mdm0 add event and
# every 5 min from ctt-modem-ecm-up.timer, so the healthy path must be cheap.
if ip -4 addr show "$IFACE" | grep -q 'inet ' &&
   ip route show default dev "$IFACE" | grep -q .; then
  echo "modem-ecm-up: $IFACE already configured; nothing to do"
  exit 0
fi

ip link set "$IFACE" up

# Reap a dhclient left over from an earlier bring-up. It SURVIVES a USB
# re-enumeration but can never re-lease on the new netdev — it just loops
# "send_packet: Network is unreachable" forever (13,703 such lines on V30B0154C65F,
# 2026-08-27) and would fight the instance we are about to start. -x stops it without
# sending a RELEASE, which is what we want: the lease it holds is already dead.
dhclient -x -pf "/run/dhclient-$IFACE.pid" 2>/dev/null || true

# DHCP the address (Telit-documented method). -1 bounds the FAILURE path only: "try
# once, exit non-zero if no lease". On SUCCESS dhclient still daemonizes and keeps
# renewing, which is exactly what we want — the renewer that survives this script is
# what holds the lease for the life of the boot (observed: one dhclient alive 2 d 21 h
# across 6 clean renewals on V30B0154C65F). ctt-modem-ecm-up.service's KillMode=process
# exists precisely to keep that daemon alive; do not "simplify" either half without
# the other, or lease renewal dies fleet-wide.
# Retry: right after the ECM bind (or before the modem finishes registering) the module
# may not answer DHCP for a few seconds, so a single attempt can lose the race. Retry a
# few times before giving up (still fail-open so it never blocks boot).
leased=0
for attempt in 1 2 3 4 5 6; do
  if timeout 25 dhclient -1 -pf "/run/dhclient-$IFACE.pid" -lf "/run/dhclient-$IFACE.leases" "$IFACE"; then
    leased=1; break
  fi
  echo "modem-ecm-up: no lease on $IFACE yet (attempt $attempt/6); retrying in 5s..."
  sleep 5
done
if [ "$leased" != 1 ]; then
  echo "modem-ecm-up: dhclient got no lease on $IFACE after retries (modem not registered yet?) — leaving it"
  exit 0
fi

# Re-pin the default route dhclient just added (metric 0) to a fallback metric so it
# cannot preempt wired/WiFi.
GW=$(ip route show default dev "$IFACE" 2>/dev/null | awk '{print $3; exit}')
[ -n "$GW" ] || GW=192.168.225.1
ip route del default dev "$IFACE" 2>/dev/null || true
ip route replace default via "$GW" dev "$IFACE" metric "$METRIC"

echo "modem-ecm-up: $IFACE up $(ip -4 -br addr show "$IFACE" | awk '{print $3}'), default via $GW metric $METRIC (fallback)"

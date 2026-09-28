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

ip link set "$IFACE" up

# Is the dhclient named by our pidfile still running AND still the renewer for this
# iface? /proc rather than `kill -0` on purpose: kill -0 returns EPERM (not ESRCH) for
# a root-owned pid when this script is run by hand as ctt, which would report a live
# renewer as dead. Matching cmdline also rejects a recycled PID.
dhclient_alive() {
  local pid
  pid="$(cat "/run/dhclient-$IFACE.pid" 2>/dev/null)" || return 1
  case "$pid" in ''|*[!0-9]*) return 1;; esac
  [ -r "/proc/$pid/comm" ] || return 1
  # comm is the executable name alone, so an unrelated process whose ARGV merely
  # mentions dhclient (a shell running this script, a grep) can never match.
  [ "$(cat "/proc/$pid/comm" 2>/dev/null)" = dhclient ] || return 1
  # ...and it must be OUR iface's renewer, not another interface's.
  tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null | grep -qx "$IFACE"
}

# Already-configured fast path. The timer fires every 5 min; without this guard every
# tick reaps the renewing dhclient (-x below) and re-runs a full DISCOVER/REQUEST/ACK,
# so the daemon never survives to its own T1 and the renewal path this unit exists to
# protect is never exercised (measured on V30B0154C65F 2026-09-28: pid churned
# 1532 -> 2477 -> 2707 -> 2909, lease T1 ~11 h, never once reached). Requiring all
# three of address + default route + a LIVE dhclient means any partially-torn-down
# state still falls through to the full bring-up below — this only short-circuits a
# data path that is genuinely healthy.
# The route test checks the METRIC, not merely that some default route exists.
# dhclient-script re-adds a default route at metric 0 whenever it takes its BOUND
# path (a lease returning a DIFFERENT address) or its TIMEOUT path (server stopped
# answering, old lease re-applied). Metric 0 outranks eth0's 50, so cellular would
# silently capture all station traffic. An existence-only test matched that route and
# short-circuited the demotion below, making the capture permanent — the 5-minute tick
# used to undo it before this fast path existed.
if ip -4 addr show "$IFACE" 2>/dev/null | grep -q 'inet ' \
   && [ "$(ip route show default dev "$IFACE" 2>/dev/null | wc -l)" = 1 ] \
   && ip route show default dev "$IFACE" 2>/dev/null | grep -q "metric $METRIC" \
   && dhclient_alive; then
  echo "modem-ecm-up: $IFACE already configured $(ip -4 -br addr show "$IFACE" | awk '{print $3}') with a live renewer; nothing to do"
  exit 0
fi

# Reap a dhclient left over from an earlier bring-up. It SURVIVES a USB
# re-enumeration but can never re-lease on the new netdev — it just loops
# "send_packet: Network is unreachable" forever (13,703 such lines on V30B0154C65F,
# 2026-08-27) and would fight the instance we are about to start. -x stops it without
# sending a RELEASE, which is what we want: the lease it holds is already dead.
dhclient -x -pf "/run/dhclient-$IFACE.pid" 2>/dev/null 9>&- || true

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
  # 9>&- closes the lock fd for the child. This is NOT optional: dhclient daemonizes
  # on success and outlives this script, and an flock belongs to the open file
  # DESCRIPTION, so an inherited fd 9 would leave the renewer holding the lock for the
  # life of the boot. Every later run — timer tick or udev event — would then fail
  # `flock -n` and exit early, so the data path would recover exactly once per boot and
  # never again. Measured on V30B0154C65F 2026-08-31: the first re-enumeration after
  # the guard landed recovered in 8 s, the second never recovered at all and needed a
  # reboot. Same reasoning for the -x reap above.
  if timeout 25 dhclient -1 -pf "/run/dhclient-$IFACE.pid" -lf "/run/dhclient-$IFACE.leases" "$IFACE" 9>&-; then
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
# Parse the gateway positionally ONLY from a route that actually has a "via": a
# default route without one (link-scope) shifts the fields, and $3 would then be a
# non-empty but wrong token that the -n fallback below cannot catch.
GW=$(ip route show default dev "$IFACE" 2>/dev/null | awk '/ via /{for(i=1;i<NF;i++) if($i=="via"){print $(i+1); exit}}')
[ -n "$GW" ] || GW=192.168.225.1

# Delete EVERY default route on this iface, not just the first. `ip route del` removes
# one match per call, so a single call cannot converge: with two routes present each
# run would delete one and replace one, leaving two forever. dhclient can produce a
# second (metric 0, see above), and a DHCP offer carrying several routers makes one
# per router with incrementing metrics. Bounded so a route we cannot delete cannot
# spin the loop.
for _ in 1 2 3 4 5 6 7 8; do
  ip route show default dev "$IFACE" 2>/dev/null | grep -q . || break
  ip route del default dev "$IFACE" 2>/dev/null || break
done
ip route replace default via "$GW" dev "$IFACE" metric "$METRIC"

echo "modem-ecm-up: $IFACE up $(ip -4 -br addr show "$IFACE" | awk '{print $3}'), default via $GW metric $METRIC (fallback)"

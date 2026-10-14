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
# Route safety: dhclient would install a metric-0 default via the module, which
# would PREEMPT eth0/wlan0. system/dhcp/dhclient-enter-hooks.d/ctt-mdm0 sets
# IF_METRIC so dhclient-script creates that route at the fallback metric in the
# first place, and cellular is used only when no wired/WiFi default has a route.
#
# Idempotent; fails open (exit 0) when mdm0 is absent (modem off/disabled/non-Telit)
# so it never blocks boot.
set -u

IFACE=mdm0

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

# DHCP the address (Telit-documented method). -1 bounds the FAILURE path: "try once,
# exit non-zero if no lease". On success dhclient daemonizes, but systemd reaps that
# daemon with the unit's cgroup when ExecStart returns, so nothing renews the lease.
# system/dhcp/dhclient-enter-hooks.d/ctt-mdm0 therefore blanks the lease time so
# the address is installed PERMANENT; without it the kernel deletes mdm0's address
# exactly one lease (24 h) after every boot. The same hook sets IF_METRIC, so the
# default route dhclient-script installs here already carries the fallback metric.
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

echo "modem-ecm-up: $IFACE up $(ip -4 -br addr show "$IFACE" | awk '{print $3}'), $(ip route show default dev "$IFACE" 2>/dev/null | head -1)"

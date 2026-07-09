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

# DHCP the address (Telit-documented method). -1: one attempt then exit — no lingering
# daemon; the lease is long and the module always offers the same deterministic address.
if ! timeout 25 dhclient -1 -pf "/run/dhclient-$IFACE.pid" -lf "/run/dhclient-$IFACE.leases" "$IFACE"; then
  echo "modem-ecm-up: dhclient got no lease on $IFACE (modem not registered yet?) — leaving it"
  exit 0
fi

# Re-pin the default route dhclient just added (metric 0) to a fallback metric so it
# cannot preempt wired/WiFi.
GW=$(ip route show default dev "$IFACE" 2>/dev/null | awk '{print $3; exit}')
[ -n "$GW" ] || GW=192.168.225.1
ip route del default dev "$IFACE" 2>/dev/null || true
ip route replace default via "$GW" dev "$IFACE" metric "$METRIC"

echo "modem-ecm-up: $IFACE up $(ip -4 -br addr show "$IFACE" | awk '{print $3}'), default via $GW metric $METRIC (fallback)"

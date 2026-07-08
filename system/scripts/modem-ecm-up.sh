#!/bin/bash
# modem-ecm-up.sh — bring up the Telit CDC-ECM data interface (mdm0).
#
# Why this is out of band of NetworkManager: in the ECM composition ModemManager
# owns the modem (we need it for signal / registration / ICCID via mmcli — see
# modem-cache.js), and NM subsumes the modem's cdc_ether net port (mdm0) into
# that single "modem" device. NM therefore never surfaces mdm0 as an Ethernet
# device it can DHCP — `nmcli device` doesn't even list it, and NM_UNMANAGED=0 /
# ID_MM_CANDIDATE=0 don't change that (an MM modem's net port is simply not an NM
# ethernet device). So we configure mdm0 ourselves.
#
# The data path is modem self-NAT: the Telit runs a fixed DHCP server at
# 192.168.225.1 and hands the host 192.168.225.2/24 (same as the old RNDIS path).
# That addressing is deterministic, so we assign it statically — no DHCP client
# to keep alive.
#
# REQUIREMENT: the modem must never preempt Ethernet or WiFi. The default route
# via mdm0 is installed at a HIGH metric (fallback only): the kernel uses it only
# when no lower-metric default (eth0 ~50, wlan0 ~600) has a route. This keeps
# cellular strictly a last resort and leaves wired/WiFi untouched.
#
# Idempotent; safe to re-run. No-ops (exit 0) if mdm0 is absent (modem off or
# disabled), so it never blocks boot.
set -u

IFACE=mdm0
ADDR=192.168.225.2
PREFIX=24
GW=192.168.225.1
METRIC=700   # > eth0 (~50) and wlan0 (~600): cellular is fallback-only

# Wait (bounded) for the ECM interface, renamed from the cdc_ether netdev by
# 78-ctt-telit-net.rules. Absent = modem off/disabled/non-Telit → nothing to do.
for _ in $(seq 1 20); do
  [ -e "/sys/class/net/$IFACE" ] && break
  sleep 1
done
if [ ! -e "/sys/class/net/$IFACE" ]; then
  echo "modem-ecm-up: $IFACE not present — modem off or not ECM; nothing to do"
  exit 0
fi

ip link set "$IFACE" up

# Assign the self-NAT host address if it isn't already there.
if ! ip -4 addr show dev "$IFACE" | grep -qw "$ADDR"; then
  ip addr add "$ADDR/$PREFIX" dev "$IFACE"
fi

# Fallback default route via the modem's NAT gateway (high metric).
ip route replace default via "$GW" dev "$IFACE" metric "$METRIC"

echo "modem-ecm-up: $IFACE up ($ADDR/$PREFIX, default via $GW metric $METRIC)"

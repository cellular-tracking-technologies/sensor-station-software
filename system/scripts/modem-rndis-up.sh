#!/bin/bash
# modem-rndis-up.sh — bring up the Telit RNDIS (mdm0) host data path.
#
# The Telit LE910Q1 self-NATs the cellular context onto its RNDIS net port
# (mdm0): the modem runs an internal DHCP server (192.168.225.1) and NATs to the
# active PDP context. The modem-side binding (AT#RNDIS, NV-persistent, applied by
# ctt-modem-provision) survives reboots, so at boot the modem comes up already
# forwarding — the host only needs a DHCP lease on mdm0. Nothing did that before:
# no DHCP client was wired to mdm0, so the RNDIS path stayed dark even though the
# gsm/PPP profile is (correctly) kept from autodialing to avoid the
# ESM_MULTIPLE_PDN collision (see modem-datapath.sh). Result on affected stations:
# registered modem, no data path with eth0 unplugged.
#
# This runs the DHCP client (busybox udhcpc — the only client on the image) as a
# long-lived daemon so the 24h lease renews; a custom hook (modem-rndis.udhcpc)
# installs mdm0's address and a LOW-priority default route (metric 700) so a wired
# uplink (eth0, metric 50) stays primary and cellular is the failover. It never
# touches /etc/resolv.conf.
#
# Telit-only: Quectel (2c7c:*) uses QMI/wwan0 dialed by NetworkManager, and with
# no modem there is nothing to do. Respects the operator on/off marker. Runs from
# ctt-modem-rndis.service (After=ModemManager + station-boot).
set -u

TELIT='1bc7:7020'
IFACE='mdm0'
MARKER='/etc/ctt/modem-disabled'
HOOK='/lib/ctt/sensor-station-software/system/scripts/modem-rndis.udhcpc'

# Operator turned the modem off — do not bring up cellular.
if [ -e "$MARKER" ]; then
  echo "modem-rndis: modem disabled ($MARKER) — not bringing up $IFACE"
  exit 0
fi

# Telit-only. A Quectel dials QMI/wwan0 via NetworkManager; no modem => nothing to do.
if ! lsusb -d "$TELIT" >/dev/null 2>&1; then
  echo "modem-rndis: no Telit ($TELIT) on USB — nothing to do (Quectel/none uses a different path)"
  exit 0
fi

# Wait for the RNDIS net interface to enumerate (a cold-booted Telit takes ~15s).
for _ in $(seq 1 30); do
  [ -e "/sys/class/net/$IFACE" ] && break
  sleep 2
done
if [ ! -e "/sys/class/net/$IFACE" ]; then
  echo "modem-rndis: $IFACE never appeared — modem not in RNDIS mode? (check AT#RNDIS / ctt-modem-provision)"
  exit 1   # Restart=on-failure retries; a slow/absent modem should not be fatal-permanent
fi

ip link set "$IFACE" up 2>/dev/null

echo "modem-rndis: leasing $IFACE via udhcpc (metric-700 default route; DNS left untouched)"
# Foreground (-f): udhcpc becomes this service's main process and renews the lease.
# -t 0: retry discovers forever (the modem's DHCP may take a moment post-register).
exec busybox udhcpc -f -i "$IFACE" -s "$HOOK" -t 0 -T 5

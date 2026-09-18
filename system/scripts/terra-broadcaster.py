#!/usr/bin/env python3
"""terra_broadcaster — LAN discovery beacon.

Sends a UDP broadcast on port 64644 every 30 s with the station's
serial, firmware version, and a snapshot of wlan0 signal info. The
companion `stationfinder.py` (run on a laptop on the same LAN) listens
for these beacons to enumerate Terras during install/QA without needing
mDNS or cloud connectivity.

Port from the legacy terra_broadcaster.py with the brittle iwconfig
string parsing replaced by `iw dev wlan0 link`, which has a stable
key:value format. Output JSON shape is preserved so stationfinder
keeps working unchanged.

Egress policy: this is a LAN beacon, so it must never consult the default
route. The original code called sendto("<broadcast>") on an unbound socket,
which lets the kernel pick the interface from the routing table — and on a
cellular-only field station the modem is the SOLE default route, so the
beacon went out the modem instead of the LAN. See pick_interfaces().
"""

import fcntl
import json
import os
import re
import signal
import socket
import struct
import subprocess
import sys
import time
from typing import Dict, List, Optional, Tuple

BROADCAST_PORT  = 64644
BROADCAST_EVERY_S = 30

PACKAGE_JSON    = "/usr/lib/ctt/sensor-station-software/package.json"
SERIAL_FILE     = "/etc/ctt/station-id"

SYS_NET = "/sys/class/net"

# Also send the legacy limited broadcast (255.255.255.255) alongside the
# subnet-directed one. Off by default: the subnet-directed address reaches
# every host on the segment and a listener bound to 0.0.0.0 receives it
# identically, so sending both just doubles the packets and makes one station
# look like two. Flip to True only if a legacy stationfinder build turns out
# to filter on the limited-broadcast destination.
SEND_LIMITED_BROADCAST = False

# Never beacon out of these. The cellular data path is why this list exists —
# on a cellular-only station it is the sole default route:
#   mdm0   Telit CDC-ECM. Ethernet-class, so sendto() SUCCEEDS; the packet
#          crosses USB into the module and is dropped there (RFC 1122: a
#          limited broadcast is never forwarded past a router). Costs no
#          billable data, but nothing can ever hear it.
#   wwan0  Quectel QMI raw-IP, ppp0 legacy PPP. No IFF_BROADCAST, so sendto()
#          fails ENETUNREACH — which the original code logged every 30 s, i.e.
#          2880 misleading "network down?" lines a day, forever.
EXCLUDE_PREFIXES = (
    "mdm", "wwan", "ppp", "lo", "docker", "veth", "br-", "tun", "tap", "wg",
)

# <linux/sockios.h> / <net/if.h>
SIOCGIFBRDADDR  = 0x8919
IFF_UP          = 0x1
IFF_BROADCAST   = 0x2
IFF_LOOPBACK    = 0x8
IFF_POINTOPOINT = 0x10


_running = True


def log(msg: str) -> None:
    print(f"terra_broadcaster: {msg}", flush=True)


def shutdown(signum, _frame) -> None:
    global _running
    log(f"signal {signum}; exiting")
    _running = False


def read_text(path: str, default: str = "UNKNOWN") -> str:
    try:
        with open(path) as f:
            return f.read().strip() or default
    except OSError:
        return default


# -----------------------------------------------------------------------
# WiFi snapshot — `iw dev wlan0 link` has a stable key:value format that
# is much friendlier to parse than iwconfig's free-form text.
# -----------------------------------------------------------------------

def wifi_snapshot() -> str:
    """Return the legacy comma-joined WiFi string. Order is preserved
    for backward compatibility with stationfinder:
        essid,freq,rate,quality,rssi,rx,tx
    Fields we can't read fall back to the legacy underscore sentinels
    so consumers can detect a missing element."""
    essid = "_NO_ESSID"
    freq = "_NO_FREQ"
    rate = "_NO_RATE"
    rssi = "_NO_RSSI"

    try:
        out = subprocess.check_output(
            ["/usr/sbin/iw", "dev", "wlan0", "link"],
            stderr=subprocess.STDOUT,
            timeout=2,
        ).decode("utf-8", errors="replace")
    except Exception:
        return "WIFI_PARSE_FAILURE"

    if "Not connected" in out:
        return "_NOT_CONNECTED,_,_,_,_,_,_"

    m = re.search(r"SSID:\s*(.+)", out)
    if m:
        essid = m.group(1).strip()
    m = re.search(r"freq:\s*(\d+)", out)
    if m:
        # iw reports freq in MHz; legacy iwconfig reported GHz with units.
        # Convert to GHz string so the format matches what stationfinder
        # expects (e.g., "2.412").
        freq = f"{int(m.group(1)) / 1000:.3f}"
    m = re.search(r"tx bitrate:\s*([\d.]+)\s*MBit/s", out)
    if m:
        rate = m.group(1)
    m = re.search(r"signal:\s*(-?\d+)\s*dBm", out)
    if m:
        rssi = m.group(1)

    # `quality` and rx/tx counters aren't exposed by `iw link` — pull
    # them from /proc/net/wireless for cheap-and-stable parsing.
    quality = "_NO_QUALITY"
    rx = "_NO_RX"
    tx = "_NO_TX"
    try:
        with open("/proc/net/wireless") as f:
            for line in f:
                if line.lstrip().startswith("wlan0:"):
                    cols = line.split()
                    # cols: iface status link level noise rx tx ...
                    if len(cols) >= 4:
                        quality = cols[2].rstrip(".")
                    if len(cols) >= 8:
                        rx = cols[5].rstrip(".")
                        tx = cols[6].rstrip(".")
                    break
    except OSError:
        pass

    return ",".join([essid, freq, rate, quality, rssi, rx, tx])


# -----------------------------------------------------------------------
# Interface selection — the LAN, and only the LAN.
# -----------------------------------------------------------------------

def _broadcast_addr(probe: socket.socket, ifname: str) -> Optional[str]:
    """IPv4 broadcast address of ifname, or None if it has no usable one."""
    try:
        res = fcntl.ioctl(
            probe.fileno(),
            SIOCGIFBRDADDR,
            struct.pack("256s", ifname.encode("utf-8")[:15]),
        )
    except OSError:
        return None
    addr = socket.inet_ntoa(res[20:24])
    return None if addr == "0.0.0.0" else addr


def pick_interfaces() -> List[Tuple[str, str]]:
    """Every broadcast-capable LAN interface, as (name, broadcast_addr).

    Multi-homed stations get a beacon on each one — the original single
    unbound sendto() only ever reached whichever interface owned the default
    route, so a station on both eth0 and wlan0 was invisible to a laptop on
    the other segment.
    """
    found: List[Tuple[str, str]] = []
    try:
        names = sorted(os.listdir(SYS_NET))
    except OSError:
        return found

    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        for name in names:
            if name.startswith(EXCLUDE_PREFIXES):
                continue
            try:
                with open(f"{SYS_NET}/{name}/flags") as f:
                    flags = int(f.read().strip(), 16)
            except (OSError, ValueError):
                continue
            if not (flags & IFF_UP) or not (flags & IFF_BROADCAST):
                continue
            if flags & (IFF_LOOPBACK | IFF_POINTOPOINT):
                continue
            # cdc_ether-class devices report "unknown" rather than "up"; same
            # allowance connectivity-probe.js makes.
            state = read_text(f"{SYS_NET}/{name}/operstate", "unknown")
            if state not in ("up", "unknown"):
                continue
            bcast = _broadcast_addr(probe, name)
            if bcast:
                found.append((name, bcast))
    finally:
        probe.close()
    return found


def send_beacon(ifname: str, bcast: str, msg: bytes) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        # Pin egress to this device so the packet can never fall through to the
        # default route (i.e. the modem). Needs CAP_NET_RAW, which we have as
        # root; best-effort because the subnet-directed address below already
        # routes via this interface's connected route without it.
        try:
            sock.setsockopt(
                socket.SOL_SOCKET,
                socket.SO_BINDTODEVICE,
                ifname.encode("utf-8") + b"\0",
            )
        except (OSError, AttributeError) as e:
            log(f"{ifname}: SO_BINDTODEVICE unavailable ({e}); "
                f"relying on the connected route")
        sock.sendto(msg, (bcast, BROADCAST_PORT))
        if SEND_LIMITED_BROADCAST:
            sock.sendto(msg, ("<broadcast>", BROADCAST_PORT))
        return True
    except OSError as e:
        log(f"{ifname}: broadcast to {bcast} failed: {e}")
        return False
    finally:
        try:
            sock.close()
        except OSError:
            pass


def make_message(serial: str, version: str) -> bytes:
    payload: Dict[str, str] = {
        "Device":    "SensorStation",
        "Serial":    serial,
        "Version":   version,
        "WiFi":      wifi_snapshot(),
    }
    return json.dumps(payload).encode("utf-8")


def main() -> int:
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    serial = read_text(SERIAL_FILE)
    try:
        with open(PACKAGE_JSON) as f:
            version = json.loads(f.read()).get("version", "UNKNOWN")
    except (OSError, json.JSONDecodeError):
        version = "UNKNOWN"

    log(f"starting: udp/{BROADCAST_PORT} every {BROADCAST_EVERY_S}s "
        f"(serial={serial}, version={version})")

    # Log the target set only when it CHANGES. A cellular-only station has no
    # LAN interface for months at a time; saying so once is informative, saying
    # so 2880 times a day is the spam this replaces.
    last_targets: Optional[Tuple[Tuple[str, str], ...]] = None

    while _running:
        targets = pick_interfaces()
        key = tuple(targets)
        if key != last_targets:
            if targets:
                log("beaconing on " + ", ".join(f"{n} -> {b}" for n, b in targets))
            else:
                log("no broadcast-capable LAN interface up "
                    "(cellular-only station or link down) — idle, not beaconing")
            last_targets = key

        if targets:
            # Built per cycle so the WiFi snapshot stays fresh, and skipped
            # entirely when there is nowhere to send it — which also spares the
            # `iw` subprocess on a cellular-only station.
            msg = make_message(serial, version)
            for name, bcast in targets:
                send_beacon(name, bcast, msg)

        # Sleep in 1 s slices so SIGTERM exits promptly.
        for _ in range(BROADCAST_EVERY_S):
            if not _running:
                break
            time.sleep(1)

    return 0


# -----------------------------------------------------------------------
# --check-imports: the build-time startup gate
# -----------------------------------------------------------------------
# build-deb.sh runs this against the COMPILED .bin on the build host with
# every first-party source file MOVED ASIDE, and refuses to package a binary
# that does not print PASS. Reaching this function at all means every
# module-scope import above already resolved from INSIDE the binary -- which
# is the property `--follow-import-to` is supposed to deliver and which
# terra-firmware 3.95 shipped without, crash-looping terra-webserver 161
# times on 0123CC7EBE57D84DEE.
#
# It opens NO hardware: no serial port, no GPIO, no socket, no subprocess.
# Safe to run against the installed binary on a live station.

def check_imports() -> int:
    """Prove this binary carries what it needs to reach its own code."""
    ok = True
    print("terra_broadcaster --check-imports: probing")
    # Every module-scope import above has already run to get here; name the
    # interpreter so the line is evidence rather than decoration.
    print(f"  ok python {sys.version.split()[0]} on {sys.platform}")
    print("terra_broadcaster --check-imports: " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    if "--check-imports" in sys.argv:
        sys.exit(check_imports())
    sys.exit(main())

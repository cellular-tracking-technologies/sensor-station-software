// ctt-modem-provision — provision the cellular modem's data path / attach context,
// self-healing across the field. A thin executable over the ctthw modem module:
// it opens the AT control port, identifies the modem family, and runs that
// family's provisioning. All modem logic lives in lib/ctthw/modem (so it is unit-
// tested against a scripted AT transport); this file only wires I/O to that logic
// and enforces the fail-open contract.
//
//   Telit LE910Q1 -> CDC-ECM data path   (AT#USBCFG=1 + AT#ECM=1,0)
//   Quectel EC25  -> LTE attach APN       (AT+CGDCONT CID1 matched to the SIM)
//
// Runs Before=ModemManager on /dev/ctt-modem-at (a udev symlink present for both
// families), so it owns the AT port with no MM contention and — for Quectel — sets
// the attach APN before MM brings the QMI bearer up. FAILS OPEN: any problem
// opening the port or provisioning is logged and the process exits 0, so the boot
// proceeds and ModemManager starts normally; a correctly-configured modem is a
// cheap read-only no-op.
//
// Usage: ctt-modem-provision [device-path]   (default /dev/ctt-modem-at)
//        ctt-modem-provision --dry-run        report state, never write
//        ctt-modem-provision --version

#include <cstdio>
#include <exception>
#include <string>

#include "modem/at_port.h"
#include "modem/modem.h"

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

int main(int argc, char **argv) {
  std::string port = "/dev/ctt-modem-at";
  bool dry_run = false;
  for (int i = 1; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "--version") {
      std::puts(CTT_VERSION);
      return 0;
    } else if (a == "--dry-run") {
      dry_run = true;
    } else {
      port = a;
    }
  }

  try {
    ctthw::AtPort at(port); // waits for the udev symlink, opens raw; throws if absent
    std::unique_ptr<ctthw::Modem> modem = ctthw::makeModem(at);
    std::fprintf(stderr, "ctt-modem-provision: provisioning %s%s\n", modem->name(),
                 dry_run ? " (dry-run)" : "");
    modem->provision(dry_run);
  } catch (const std::exception &e) {
    std::fprintf(stderr, "ctt-modem-provision: %s — nothing to do (fail open)\n",
                 e.what());
  }
  return 0; // always fail-open: never wedge the boot
}

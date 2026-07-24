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
#include <memory>
#include <string>

#include <unistd.h> // sleep

#include "modem/at_port.h"
#include "modem/modem.h"

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

namespace {
// A Telit RNDIS->ECM switch reboots the modem; it drops off USB then re-enumerates
// as the ECM composition in ~20-40 s. Give it time to drop, then wait (generously)
// for the ECM AT port to reappear so we can finish the bind in this same boot.
constexpr unsigned kRebootDropSecs = 8;
constexpr int kRebootWaitMs = 45000;
} // namespace

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
    ctthw::ProvisionResult r = modem->provision(dry_run);

    // One-boot convergence: if the driver rebooted the modem (Telit RNDIS->ECM), it
    // re-enumerates on a fresh AT port. Wait for it, reopen, and run again to finish
    // (Stage 2 bind) — all before ModemManager starts, so it's uncontended. Without
    // this the bind would wait for the next station reboot (no cellular until then).
    if (r == ctthw::ProvisionResult::RebootedRetry && !dry_run) {
      std::fprintf(stderr, "ctt-modem-provision: waiting for the modem to re-enumerate "
                           "as ECM to finish provisioning in this boot...\n");
      ::sleep(kRebootDropSecs); // let it drop off USB before we wait for the new port
      ctthw::AtPort at2(port, kRebootWaitMs); // waits (long) for the ECM AT port; throws -> fail-open
      std::unique_ptr<ctthw::Modem> modem2 = ctthw::makeModem(at2);
      modem2->provision(dry_run); // now on ECM composition -> binds
    }
  } catch (const std::exception &e) {
    std::fprintf(stderr, "ctt-modem-provision: %s — nothing to do (fail open)\n",
                 e.what());
  }
  return 0; // always fail-open: never wedge the boot
}

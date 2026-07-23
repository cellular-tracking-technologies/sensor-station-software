#pragma once

#include <string>

#include "modem/modem.h"

namespace ctthw {

// TelitLE910Q1 — provisions the Telit CDC-ECM data path. Two durable NV settings
// make the mdm0 (cdc_ether NAT) interface work:
//   1. USB composition = ECM: AT#USBCFG must read 1 (ECM, 1bc7:7021), not 0 (RNDIS,
//      1bc7:7020). Switching it re-enumerates the modem (a reboot), so we do it
//      first and exit; the ECM bind lands on the next invocation.
//   2. ECM session bound to a PDP context: AT#ECM must read "x,1" (bound), not "x,0".
//
// Reference: reference/chipsets/modem/telit-le910q1/ (KB). Idempotent + fail-open.
class TelitLE910Q1 : public Modem {
public:
  using Modem::Modem;

  const char *name() const override { return "Telit LE910Q1"; }
  void provision(bool dry_run) override;

  // --- Pure response parsers (no I/O; unit-tested against real fixtures) ---

  // "#USBCFG: <n>" -> the mode integer (0=RNDIS, 1=ECM), or -1 if unparseable.
  static int parseUsbcfg(const std::string &resp);
  // "#ECM: <a>,<b>" -> bound iff the second field (PDP context id) is non-zero.
  static bool parseEcmBound(const std::string &resp);
};

} // namespace ctthw

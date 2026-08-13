#pragma once

#include <string>

#include "modem/at_commands.h"
#include "modem/modem.h"

namespace ctthw {

// TelitLE910Q1 — provisions the Telit CDC-ECM data path. Three durable NV settings
// make the mdm0 (cdc_ether NAT) interface carry data:
//   1. USB composition = ECM: AT#USBCFG must read 1 (ECM, 1bc7:7021), not 0 (RNDIS,
//      1bc7:7020). Switching it re-enumerates the modem (a reboot), so we do it
//      first and return RebootedRetry; the executable waits for the modem to come
//      back as ECM, reopens the port, and re-runs — so the bind (2) completes in
//      the SAME boot rather than waiting for the next one.
//   2. ECM session bound to a PDP context: AT#ECM must read "x,1" (bound), not "x,0".
//   3. The attach context (CGDCONT CID1) matches the SIM. The ECM PDN dials CID1,
//      so a recycled Telit carrying a stale APN from a prior deployment (e.g.
//      internet.cxn baked in, now with a Kore SIM) binds ECM to the wrong APN and
//      the PDN stays dead through every reboot (bench-proven 2026-07-31). After the
//      ECM stages this runs the shared Modem::provisionAttachApn heal — the mirror
//      of the Quectel attach-context fix.
//
// Reference: reference/chipsets/modem/telit-le910q1/ (KB). Idempotent + fail-open.
class TelitLE910Q1 : public Modem {
public:
  using Modem::Modem;

  const char *name() const override { return "Telit LE910Q1"; }
  ProvisionResult provision(bool dry_run) override;

  // --- Pure response parsers (no I/O; unit-tested against real fixtures) ---

  // "#USBCFG: <n>" -> the mode integer (0=RNDIS, 1=ECM), or -1 if unparseable.
  static int parseUsbcfg(const std::string &resp);
  // "#ECM: <a>,<b>" -> bound iff the second field (PDP context id) is non-zero.
  static bool parseEcmBound(const std::string &resp);

protected:
  // The Telit reports its ICCID via AT#CCID.
  const char *iccidQueryCmd() const override { return at::telit::kCcid; }
};

} // namespace ctthw

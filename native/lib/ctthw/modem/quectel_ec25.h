#pragma once

#include "modem/at_commands.h"
#include "modem/modem.h"

namespace ctthw {

// QuectelEC25 — provisions the Quectel LTE *attach* context so it can never
// diverge from the NetworkManager dial APN (the 3GPP cause-55 trap that stranded
// the Belgium station). The Quectel is QMI-managed (ModemManager drives it over
// cdc-wdm0/wwan0; its tty ports are ID_MM_DEVICE_IGNORE=1, so the AT port is ours),
// and — unlike the Telit — it needs no ECM/USB-composition work at all, so its
// whole provision() is the shared attach-APN heal (Modem::provisionAttachApn):
// identify the SIM's carrier, and if CGDCONT CID1 carries a non-empty wrong APN,
// set it and bounce the radio so the change takes at the next attach.
//
// Reference: reference/chipsets/modem/quectel-ec25-af/ (KB). Idempotent + fail-open.
class QuectelEC25 : public Modem {
public:
  using Modem::Modem;

  const char *name() const override { return "Quectel EC25"; }
  ProvisionResult provision(bool dry_run) override;

protected:
  // The Quectel reports its ICCID via AT+QCCID.
  const char *iccidQueryCmd() const override { return at::quectel::kCcid; }
};

} // namespace ctthw

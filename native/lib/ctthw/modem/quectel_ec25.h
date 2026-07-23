#pragma once

#include <string>

#include "modem/modem.h"

namespace ctthw {

// QuectelEC25 — provisions the Quectel LTE *attach* context so it can never
// diverge from the NetworkManager dial APN (the 3GPP cause-55 trap that stranded
// the Belgium station). The Quectel is QMI-managed (ModemManager drives it over
// cdc-wdm0/wwan0; its tty ports are ID_MM_DEVICE_IGNORE=1, so the AT port is ours),
// and — unlike the Telit — it needs no ECM/USB-composition work at all.
//
// It reads the SIM ICCID (AT+QCCID), maps the country code to the carrier APN,
// and if CGDCONT CID1 does not already carry that APN, sets it and bounces the
// radio (CFUN=0/1) so the change takes effect at the next attach. The chosen APN
// is written to /run/ctt/modem-apn — the single source provision-modem-apn.sh
// reads to set the NM dial APN, so attach and dial stay identical by construction.
//
// Reference: reference/chipsets/modem/quectel-ec25-af/ (KB). Idempotent + fail-open.
class QuectelEC25 : public Modem {
public:
  static constexpr const char *kDefaultApnFile = "/run/ctt/modem-apn";
  // Per-carrier APN by SIM ICCID country code (ICCID[2:4]).
  static constexpr const char *kApnTelenor = "internet.cxn"; // cc "46"
  static constexpr const char *kApnDefault = "super";        // else (Super SIM)
  // PDP type for the attach context. "IP" (IPv4) per the documented practice
  // (AT Commands Manual V2.0 §10.2 lists IP/IPV6/IPV4V6; every practitioner guide
  // uses IP for the data context) — and these M2M SIMs are IPv4-only, with the NM
  // profile already forcing v4 via ipv6.method=disabled. Avoids an IPv6 PDN attempt
  // the network refuses.
  static constexpr const char *kPdpType = "IP";

  explicit QuectelEC25(AtTransport &at, std::string apn_file = kDefaultApnFile)
      : Modem(at), apn_file_(std::move(apn_file)) {}

  const char *name() const override { return "Quectel EC25"; }
  void provision(bool dry_run) override;

  // --- Pure helpers (no I/O; unit-tested against real fixtures) ---

  // Digits following "+QCCID:" — the SIM ICCID.
  static std::string parseIccid(const std::string &qccidResp);
  // APN for the CGDCONT context at <cid> in an "AT+CGDCONT?" reply (the 2nd quoted
  // field on that line), or "" if the context is not defined.
  static std::string parseCgdcontApn(const std::string &resp, int cid);
  // Carrier APN for an ICCID (country code = digits [2:4]); "" if too short.
  static std::string apnForIccid(const std::string &iccid);

private:
  // Publish the chosen APN for provision-modem-apn.sh. Best-effort (a failure is
  // logged, never fatal — the shell script falls back to its own mmcli mapping).
  void publishApn(const std::string &apn) const;

  std::string apn_file_;
};

} // namespace ctthw

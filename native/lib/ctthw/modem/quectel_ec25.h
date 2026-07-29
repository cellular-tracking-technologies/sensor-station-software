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
// It identifies the SIM's carrier and, if CGDCONT CID1 carries a *non-empty wrong*
// APN, sets it and bounces the radio (CFUN=0/1) so the change takes effect at the
// next attach. Carrier identity comes from the **IMSI** (AT+CIMI) first, falling
// back to the ICCID country code (AT+QCCID) — see chooseApn(). A blank CID1 is
// left alone (it attaches on the network-default APN — bench-verified to connect;
// the failure mode is a non-empty wrong APN, not a blank one), so the working
// fleet is not churned. The chosen APN is written to /run/ctt/modem-apn — the
// single source provision-modem-apn.sh reads to set the NM dial APN, so attach and
// dial stay identical by construction.
//
// Reference: reference/chipsets/modem/quectel-ec25-af/ (KB). Idempotent + fail-open.
class QuectelEC25 : public Modem {
public:
  static constexpr const char *kDefaultApnFile = "/run/ctt/modem-apn";
  // Per-carrier APN. Selected from the IMSI's home PLMN when it is recognized,
  // else from the ICCID country code (ICCID[2:4]) — see chooseApn().
  static constexpr const char *kApnTelenor = "internet.cxn"; // Telenor Connexion
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
  ProvisionResult provision(bool dry_run) override;

  // --- Pure helpers (no I/O; unit-tested against real fixtures) ---

  // Digits following "+QCCID:" — the SIM ICCID.
  static std::string parseIccid(const std::string &qccidResp);
  // Digits of an "AT+CIMI" reply — the SIM IMSI. CIMI answers with the bare IMSI
  // (no "+CIMI:" prefix), so this takes the first run of >= 14 digits.
  static std::string parseImsi(const std::string &cimiResp);
  // APN for the CGDCONT context at <cid> in an "AT+CGDCONT?" reply (the 2nd quoted
  // field on that line), or "" if the context is not defined.
  static std::string parseCgdcontApn(const std::string &resp, int cid);
  // True if the IMSI's MCC+MNC is a known Telenor (Connexion) home PLMN.
  static bool isTelenorImsi(const std::string &imsi);
  // Carrier APN from the IMSI's home PLMN, or "" when the PLMN is not recognized
  // (so the caller can fall back to the ICCID rule). Never guesses a default.
  static std::string apnForImsi(const std::string &imsi);
  // Carrier APN for an ICCID (country code = digits [2:4]); "" if too short.
  static std::string apnForIccid(const std::string &iccid);
  // The APN to use: IMSI first, ICCID second, "" if neither is usable.
  //
  // The IMSI is authoritative because it names the *subscription's* home network,
  // which is what determines the APN the carrier will accept. The ICCID only names
  // the issuer's numbering range: Telenor ships SIMs in an 8901 (US-numbered) range
  // whose ICCID country code reads "01", so the ICCID-only rule selected `super` on
  // a Telenor subscription and the network refused the bearer with 3GPP cause 33
  // (option-unsubscribed). Kept as a fallback for modems/SIMs that won't report an
  // IMSI. See investigations/ (V2 station F5C51E6B6AFA, 2026-07-29).
  static std::string chooseApn(const std::string &imsi, const std::string &iccid);

private:
  // Publish the chosen APN for provision-modem-apn.sh. Best-effort (a failure is
  // logged, never fatal — the shell script falls back to its own mmcli mapping).
  void publishApn(const std::string &apn) const;

  std::string apn_file_;
};

} // namespace ctthw

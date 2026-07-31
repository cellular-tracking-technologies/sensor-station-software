#pragma once

#include <memory>
#include <string>

#include "modem/at_port.h"

namespace ctthw {

// Outcome of a provision() pass.
enum class ProvisionResult {
  Done,          // finished (or a fail-open no-op) — nothing more to do.
  RebootedRetry, // the modem was rebooted mid-provision (Telit RNDIS->ECM USB
                 // composition switch) and will re-enumerate. The executable waits
                 // for it to come back, reopens the AT port, and runs provision()
                 // again on the fresh port to finish — so it completes in ONE boot.
};

// Modem — abstract cellular modem driver. One subclass per family; each owns the
// family-specific data-path work and shares the carrier→APN logic and the attach-
// context heal:
//
//   TelitLE910Q1 — the CDC-ECM data path (AT#USBCFG / AT#ECM), THEN the shared
//                  attach-APN heal (a recycled Telit can carry a stale CGDCONT).
//   QuectelEC25  — nothing but the shared attach-APN heal (AT+CGDCONT CID1).
//
// Provisioning is idempotent and fail-open: provision() reads state first and only
// writes when needed, reporting progress on stderr; it never exits the process
// (the executable does). Modems hold an AtTransport&, so the same logic runs
// against real hardware (AtPort) or a scripted fake in tests.
class Modem {
public:
  // --- Per-carrier APN (shared by all families) ---
  // The chosen APN is published to /run/ctt/modem-apn — the single source
  // provision-modem-apn.sh reads to set the NM dial APN, so the attach APN (written
  // to the modem's CGDCONT CID1) and the dial APN stay identical by construction.
  static constexpr const char *kDefaultApnFile = "/run/ctt/modem-apn";
  static constexpr const char *kApnTelenor = "internet.cxn"; // Telenor Connexion
  static constexpr const char *kApnDefault = "super";        // else (Twilio/Kore Super SIM)
  // PDP type for the attach context. "IP" (IPv4) per the documented practice
  // (Quectel AT Manual V2.0 §10.2 lists IP/IPV6/IPV4V6; every practitioner guide
  // uses IP for the data context) — and these M2M SIMs are IPv4-only, with the NM
  // profile already forcing v4 via ipv6.method=disabled. Avoids an IPv6 PDN attempt
  // the network refuses. Matches the CID1 PDP type observed on both families.
  static constexpr const char *kPdpType = "IP";

  explicit Modem(AtTransport &at, std::string apn_file = kDefaultApnFile)
      : at_(at), apn_file_(std::move(apn_file)) {}
  virtual ~Modem();
  Modem(const Modem &) = delete;
  Modem &operator=(const Modem &) = delete;

  // Human-readable family name (for logs).
  virtual const char *name() const = 0;

  // Bring the modem's data path / attach context to the desired state.
  // dry_run reports what it would do and makes no NV writes. Returns
  // RebootedRetry if it rebooted the modem and must be re-run after
  // re-enumeration (see ProvisionResult); Done otherwise.
  virtual ProvisionResult provision(bool dry_run) = 0;

  // --- Pure carrier/APN helpers (no I/O; unit-tested against real fixtures) ---

  // Digits of an "AT+CIMI" reply — the SIM IMSI. CIMI answers with the bare IMSI
  // (no prefix), so this takes the first run of >= 14 digits.
  static std::string parseImsi(const std::string &cimiResp);
  // The SIM ICCID from an ICCID query reply — the first run of >= 18 digits
  // (an ICCID is 18-20 digits). Prefix-agnostic, so it parses both the Quectel
  // "+QCCID: <iccid>" and the Telit "#CCID: <iccid>" forms.
  static std::string parseIccid(const std::string &ccidResp);
  // APN for the CGDCONT context at <cid> in an "AT+CGDCONT?" reply (the 2nd quoted
  // field on that line), or "" if the context is not defined.
  static std::string parseCgdcontApn(const std::string &resp, int cid);
  // True if the IMSI's MCC+MNC is a known Telenor (Connexion) home PLMN.
  static bool isTelenorImsi(const std::string &imsi);
  // True if the ICCID starts with a known Telenor *issuer* prefix (8946 or
  // 890124008). Prefix, not the 2-digit country code — see the .cpp for why bare
  // "8901" is unsafe (collides with 964 Kore SIMs; fleet-validated 2026-07-30).
  static bool isTelenorIccid(const std::string &iccid);
  // Carrier APN from the IMSI's home PLMN, or "" when the PLMN is not recognized
  // (so the caller can fall back to the ICCID rule). Never guesses a default.
  static std::string apnForImsi(const std::string &imsi);
  // Carrier APN from the ICCID issuer prefix (isTelenorIccid); "" if too short.
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

protected:
  // The AT command that reads the SIM ICCID (family-specific: Quectel AT+QCCID,
  // Telit AT#CCID; both replies are parsed by the generic parseIccid()).
  virtual const char *iccidQueryCmd() const = 0;

  // Shared attach-context provisioning — the cause-55 / recycled-context heal.
  // Reads the SIM (IMSI + ICCID), chooses the APN, and rewrites CGDCONT CID1 iff
  // it carries a *non-empty WRONG* APN (detach with CFUN=0, redefine, CFUN=1 so it
  // takes at the next attach); a blank CID1 (network-default) or an already-correct
  // one is left untouched. Always publishes the dial APN. Used by BOTH families so
  // a recycled modem's stale attach context is corrected whether it's a Quectel
  // (QMI) or a Telit (ECM) — bench-proven on a Telit 2026-07-31. Never reboots ->
  // always returns Done.
  ProvisionResult provisionAttachApn(bool dry_run);

  // Publish the chosen APN for provision-modem-apn.sh. Best-effort (a failure is
  // logged, never fatal — the shell script falls back to its own mmcli mapping).
  void publishApn(const std::string &apn) const;

  AtTransport &at_;
  std::string apn_file_;
};

// Identify the attached modem via AT+CGMI and return the matching driver. A
// Quectel manufacturer string selects the Quectel driver; Telit — and any
// unrecognized or empty response — selects the Telit driver (fail-open, and it
// preserves the pre-refactor default). Always returns a non-null driver.
std::unique_ptr<Modem> makeModem(AtTransport &at);

} // namespace ctthw

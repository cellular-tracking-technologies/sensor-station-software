#pragma once

#include <string>

// Centralized AT-command registry for the modem module.
//
// Every AT command the drivers send lives here, named once, so the wire string
// has a single source of truth: easy to find, hard to typo, and one obvious place
// to change. Prefer these over inline string literals in driver code. (Descriptive
// log/dry-run text that merely *mentions* a command is not a command and stays in
// the driver.)
//
// Layout mirrors ownership rather than enforcing it (the transport is stringly
// typed, so real "which command is valid for this modem" lives in the driver that
// references it — see Modem::iccidQueryCmd()):
//   at::          — 3GPP-standard commands used by EVERY family.
//   at::quectel:: — Quectel vendor extensions (+Q…).
//   at::telit::   — Telit vendor extensions (#…).
// A vendor command showing up in the wrong driver is then a visible red flag.
//
// Static commands are `constexpr` constants; the one parameterized command
// (CGDCONT define) is a small builder so its wire format is also defined once.
// Naming: k<Area><Action>.

namespace ctthw {
namespace at {

// --- Common: 3GPP-standard, used by every modem family ---
inline constexpr const char *kCgmi = "AT+CGMI"; // manufacturer (modem-family detect)
inline constexpr const char *kCimi = "AT+CIMI"; // IMSI (bare digits, no prefix)
inline constexpr const char *kCgdcontQuery = "AT+CGDCONT?"; // list defined contexts
inline constexpr const char *kCfunOff = "AT+CFUN=0"; // radio off (detach before CGDCONT rewrite)
inline constexpr const char *kCfunOn = "AT+CFUN=1";  // radio on (re-attach)

// Define PDP context <cid>: AT+CGDCONT=<cid>,"<pdp_type>","<apn>". Parameterized,
// so the wire format is built in exactly one place.
inline std::string cgdcontDefine(int cid, const std::string &pdp_type,
                                 const std::string &apn) {
  return "AT+CGDCONT=" + std::to_string(cid) + ",\"" + pdp_type + "\",\"" + apn +
         "\"";
}

// --- Quectel vendor extensions (+Q…) ---
namespace quectel {
inline constexpr const char *kCcid = "AT+QCCID"; // ICCID ("+QCCID: <iccid>")
} // namespace quectel

// --- Telit vendor extensions (#…) ---
namespace telit {
inline constexpr const char *kCcid = "AT#CCID";           // ICCID ("#CCID: <iccid>")
inline constexpr const char *kUsbcfgQuery = "AT#USBCFG?"; // current USB composition
inline constexpr const char *kUsbcfgEcm = "AT#USBCFG=1";  // switch to ECM composition
inline constexpr const char *kReboot = "AT#REBOOT";       // reboot the modem
inline constexpr const char *kEcmQuery = "AT#ECM?";       // ECM bind state
inline constexpr const char *kEcmBind = "AT#ECM=1,0";     // bind ECM to PDP context 1
} // namespace telit

} // namespace at
} // namespace ctthw

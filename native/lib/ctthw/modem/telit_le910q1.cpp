#include "modem/telit_le910q1.h"

#include "modem/at_commands.h"

#include <cstdio>

namespace ctthw {

int TelitLE910Q1::parseUsbcfg(const std::string &resp) {
  auto p = resp.find("#USBCFG:");
  if (p == std::string::npos)
    return -1;
  size_t i = p + 8;
  while (i < resp.size() && resp[i] == ' ')
    ++i;
  if (i >= resp.size() || resp[i] < '0' || resp[i] > '9')
    return -1;
  int v = 0;
  while (i < resp.size() && resp[i] >= '0' && resp[i] <= '9')
    v = v * 10 + (resp[i++] - '0');
  return v;
}

bool TelitLE910Q1::parseEcmBound(const std::string &resp) {
  auto p = resp.find("#ECM:");
  if (p == std::string::npos)
    return false;
  auto comma = resp.find(',', p);
  if (comma == std::string::npos)
    return false;
  size_t i = comma + 1;
  while (i < resp.size() && resp[i] == ' ')
    ++i;
  return i < resp.size() && resp[i] >= '1' && resp[i] <= '9';
}

ProvisionResult TelitLE910Q1::provision(bool dry_run) {
  // Stage 1: ensure the ECM USB composition (AT#USBCFG=1).
  std::string u = at_.cmd(at::telit::kUsbcfgQuery, 3000);
  int mode = parseUsbcfg(u);
  if (mode < 0) {
    std::fprintf(stderr,
                 "ctt-modem-provision: no #USBCFG response ('%s') — leaving "
                 "modem untouched\n",
                 flattenReply(u).c_str());
    return ProvisionResult::Done; // fail open
  }
  if (mode != 1) {
    std::fprintf(stderr, "ctt-modem-provision: USBCFG=%d (not ECM) [%s]\n", mode,
                 flattenReply(u).c_str());
    if (dry_run) {
      std::fprintf(stderr, "ctt-modem-provision: --dry-run — would write "
                           "AT#USBCFG=1 then AT#REBOOT (then bind ECM + set APN)\n");
      return ProvisionResult::Done; // dry-run never reboots
    }
    std::string w = at_.cmd(at::telit::kUsbcfgEcm, 5000);
    if (w.find("OK") == std::string::npos) {
      std::fprintf(stderr,
                   "ctt-modem-provision: USBCFG write not confirmed ('%s') — "
                   "NOT rebooting\n",
                   flattenReply(w).c_str());
      return ProvisionResult::Done; // fail open
    }
    std::fprintf(stderr, "ctt-modem-provision: switching to ECM composition; "
                         "rebooting modem (AT#REBOOT)\n");
    at_.cmd(at::telit::kReboot, 5000);
    std::fprintf(stderr, "ctt-modem-provision: modem rebooting into ECM "
                         "(1bc7:7021); will bind + set APN once it re-enumerates\n");
    // The executable reopens the re-enumerated AT port and runs us again -> Stage 2,
    // so the bind lands in THIS boot (before ModemManager) rather than the next one.
    return ProvisionResult::RebootedRetry;
  }

  // Stage 2: ensure the ECM session is bound (AT#ECM=1,0).
  std::string e = at_.cmd(at::telit::kEcmQuery, 3000);
  if (e.find("#ECM:") == std::string::npos) {
    std::fprintf(stderr,
                 "ctt-modem-provision: no #ECM response ('%s') — leaving modem "
                 "untouched\n",
                 flattenReply(e).c_str());
    return ProvisionResult::Done; // fail open
  }

  bool bound = parseEcmBound(e);
  std::fprintf(stderr,
               "ctt-modem-provision: ECM composition OK; AT#ECM? -> %s [%s]\n",
               bound ? "bound (provisioned)" : "UNBOUND (needs binding)",
               flattenReply(e).c_str());

  if (!bound) {
    if (dry_run) {
      std::fprintf(stderr, "ctt-modem-provision: --dry-run — would write "
                           "AT#ECM=1,0\n");
      // fall through to the (also dry-run) attach-APN stage
    } else {
      std::fprintf(stderr, "ctt-modem-provision: binding ECM to PDP context 1 "
                           "(AT#ECM=1,0)\n");
      std::string w = at_.cmd(at::telit::kEcmBind, 5000);
      if (w.find("OK") == std::string::npos) {
        std::fprintf(stderr,
                     "ctt-modem-provision: ECM bind not confirmed ('%s')\n",
                     flattenReply(w).c_str());
        return ProvisionResult::Done; // fail open — can't bind, don't touch the APN
      }
      std::fprintf(stderr, "ctt-modem-provision: ECM bound\n");
    }
  }

  // Stage 3: heal the attach context (CGDCONT CID1) to the SIM's APN — shared with
  // the Quectel. The ECM PDN dials CID1, so an ECM-bound-but-wrong-APN Telit (a
  // recycled modem carrying a stale context) stays dead until this rewrites it.
  return provisionAttachApn(dry_run);
}

} // namespace ctthw

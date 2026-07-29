#include "modem/quectel_ec25.h"

#include <cctype>
#include <cstdio>

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

namespace ctthw {

std::string QuectelEC25::parseIccid(const std::string &qccidResp) {
  auto p = qccidResp.find("+QCCID:");
  if (p == std::string::npos)
    return "";
  size_t i = p + 7;
  while (i < qccidResp.size() &&
         !std::isdigit(static_cast<unsigned char>(qccidResp[i])))
    ++i;
  std::string out;
  while (i < qccidResp.size() &&
         std::isdigit(static_cast<unsigned char>(qccidResp[i])))
    out += qccidResp[i++];
  return out;
}

std::string QuectelEC25::parseCgdcontApn(const std::string &resp, int cid) {
  // Line form: +CGDCONT: <cid>,"<PDP_type>","<APN>","<addr>",...
  // -> quoted-field index 0 = PDP_type, index 1 = APN.
  std::string needle = "+CGDCONT: " + std::to_string(cid) + ",";
  auto p = resp.find(needle);
  if (p == std::string::npos)
    return "";
  size_t end = resp.find('\n', p);
  std::string line =
      resp.substr(p, end == std::string::npos ? std::string::npos : end - p);
  int q = 0;
  size_t i = 0;
  while (i < line.size()) {
    if (line[i] == '"') {
      size_t j = line.find('"', i + 1);
      if (j == std::string::npos)
        break;
      if (q == 1)
        return line.substr(i + 1, j - i - 1); // the APN
      ++q;
      i = j + 1;
    } else {
      ++i;
    }
  }
  return "";
}

std::string QuectelEC25::parseImsi(const std::string &cimiResp) {
  // AT+CIMI answers with the bare IMSI, no "+CIMI:" prefix, e.g.
  //   "\r\n240080008862744\r\n\r\nOK\r\n"
  // Take the first run of >= 14 digits so a command echo or status token can't be
  // mistaken for it (an IMSI is 14-15 digits).
  size_t i = 0;
  while (i < cimiResp.size()) {
    if (!std::isdigit(static_cast<unsigned char>(cimiResp[i]))) {
      ++i;
      continue;
    }
    size_t j = i;
    while (j < cimiResp.size() &&
           std::isdigit(static_cast<unsigned char>(cimiResp[j])))
      ++j;
    if (j - i >= 14)
      return cimiResp.substr(i, j - i);
    i = j;
  }
  return "";
}

bool QuectelEC25::isTelenorImsi(const std::string &imsi) {
  // Telenor Connexion's home PLMN (MCC 240 = Sweden, MNC 08). MCC 240 uses
  // 2-digit MNCs, so a 5-digit MCC+MNC prefix is unambiguous.
  //
  // Add PLMNs here as carriers are onboarded. Do NOT widen the ICCID
  // country-code rule instead — the ICCID range is the issuer's, not the
  // subscription's, and conflating the two is the original defect.
  static const char *const kTelenorPlmns[] = {"24008"};
  for (const char *plmn : kTelenorPlmns) {
    const std::string prefix(plmn);
    if (imsi.size() >= prefix.size() &&
        imsi.compare(0, prefix.size(), prefix) == 0)
      return true;
  }
  return false;
}

std::string QuectelEC25::apnForImsi(const std::string &imsi) {
  if (imsi.size() < 5)
    return "";
  return isTelenorImsi(imsi) ? kApnTelenor : "";
}

std::string QuectelEC25::apnForIccid(const std::string &iccid) {
  if (iccid.size() < 4)
    return "";
  return iccid.substr(2, 2) == "46" ? kApnTelenor : kApnDefault;
}

std::string QuectelEC25::chooseApn(const std::string &imsi,
                                   const std::string &iccid) {
  const std::string byImsi = apnForImsi(imsi);
  if (!byImsi.empty())
    return byImsi;
  return apnForIccid(iccid);
}

void QuectelEC25::publishApn(const std::string &apn) const {
  ::mkdir("/run/ctt", 0755); // ignore EEXIST; relevant only for the default path
  int fd = ::open(apn_file_.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (fd < 0) {
    std::fprintf(stderr, "ctt-modem-provision: could not write %s (non-fatal)\n",
                 apn_file_.c_str());
    return;
  }
  std::string line = apn + "\n";
  if (::write(fd, line.data(), line.size()) < 0)
    std::fprintf(stderr, "ctt-modem-provision: short write to %s (non-fatal)\n",
                 apn_file_.c_str());
  ::close(fd);
}

ProvisionResult QuectelEC25::provision(bool dry_run) {
  // IMSI first (names the subscription's home network, which decides the APN),
  // ICCID second (names only the issuer's numbering range). See chooseApn().
  const std::string imsi = parseImsi(at_.cmd("AT+CIMI", 3000));
  const std::string iccid = parseIccid(at_.cmd("AT+QCCID", 3000));
  const std::string apn = chooseApn(imsi, iccid);
  if (apn.empty()) {
    std::fprintf(stderr,
                 "ctt-modem-provision: Quectel — no usable IMSI or ICCID (IMSI "
                 "'%s', ICCID '%s') — leaving APN untouched\n",
                 imsi.c_str(), iccid.c_str());
    return ProvisionResult::Done; // fail open — never guess an APN
  }
  const std::string plmn = imsi.size() >= 5 ? imsi.substr(0, 5) : "(none)";
  const std::string cc = iccid.size() >= 4 ? iccid.substr(2, 2) : "(none)";
  const char *source = apnForImsi(imsi).empty() ? "ICCID cc" : "IMSI PLMN";
  std::fprintf(stderr,
               "ctt-modem-provision: Quectel — IMSI PLMN %s / ICCID cc %s -> APN "
               "'%s' (by %s)\n",
               plmn.c_str(), cc.c_str(), apn.c_str(), source);

  std::string cg = at_.cmd("AT+CGDCONT?", 3000);
  if (cg.find("+CGDCONT:") == std::string::npos) {
    std::fprintf(stderr,
                 "ctt-modem-provision: no +CGDCONT response ('%s') — leaving "
                 "modem untouched\n",
                 flattenReply(cg).c_str());
    return ProvisionResult::Done; // fail open
  }
  // Rewrite only a non-empty WRONG CID1 APN — that divergence (attach APN !=
  // dial APN) is what triggers cause-55. Two cases are left untouched (no radio
  // bounce), and both still publish the dial APN so the NM side is set:
  //   - already the desired APN, or
  //   - BLANK: a blank CID1 attaches on the network-default APN (bench-verified:
  //     connects fine). The proven failure mode is a non-empty WRONG APN, not a
  //     blank one, so we don't churn the working fleet of blank-CID1 stations.
  std::string current = parseCgdcontApn(cg, 1);
  std::fprintf(stderr,
               "ctt-modem-provision: Quectel — CGDCONT CID1 APN '%s' (want '%s')\n",
               current.empty() ? "(blank)" : current.c_str(), apn.c_str());

  if (current == apn) {
    std::fprintf(stderr, "ctt-modem-provision: Quectel — attach APN already "
                         "correct; no NV write\n");
    publishApn(apn); // still publish so the NM side has the source of truth
    return ProvisionResult::Done;
  }
  if (current.empty()) {
    std::fprintf(stderr, "ctt-modem-provision: Quectel — CGDCONT CID1 blank "
                         "(network-default APN); leaving attach context, "
                         "publishing dial APN '%s'\n",
                 apn.c_str());
    publishApn(apn);
    return ProvisionResult::Done;
  }

  if (dry_run) {
    std::fprintf(stderr,
                 "ctt-modem-provision: --dry-run — would write CFUN=0 / "
                 "CGDCONT=1,\"%s\",\"%s\" / CFUN=1, then publish %s\n",
                 kPdpType, apn.c_str(), apn_file_.c_str());
    return ProvisionResult::Done;
  }

  // A CGDCONT change is rejected on an already-activated context (AT Commands
  // Manual V2.0 §10.2: "not allowed to change the definition of an already
  // activated context"), so detach first; the change then takes effect at the
  // next attach. Run Before=ModemManager, this radio bounce is uncontended.
  std::fprintf(stderr, "ctt-modem-provision: Quectel — setting attach APN "
                       "(CFUN=0 / CGDCONT CID1 / CFUN=1)\n");
  at_.cmd("AT+CFUN=0", 5000);
  std::string w =
      at_.cmd(std::string("AT+CGDCONT=1,\"") + kPdpType + "\",\"" + apn + "\"", 5000);
  if (w.find("OK") == std::string::npos) {
    std::fprintf(stderr,
                 "ctt-modem-provision: Quectel — CGDCONT write not confirmed "
                 "('%s'); re-attaching and leaving APN as-is\n",
                 flattenReply(w).c_str());
    at_.cmd("AT+CFUN=1", 5000); // restore the radio even on failure
    return ProvisionResult::Done; // fail open
  }
  at_.cmd("AT+CFUN=1", 5000);
  std::fprintf(stderr,
               "ctt-modem-provision: Quectel — attach APN set to '%s'; radio "
               "re-attaching (MM brings the wwan0 bearer up)\n",
               apn.c_str());
  publishApn(apn);
  return ProvisionResult::Done;
}

} // namespace ctthw

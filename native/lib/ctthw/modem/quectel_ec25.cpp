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

std::string QuectelEC25::apnForIccid(const std::string &iccid) {
  if (iccid.size() < 4)
    return "";
  return iccid.substr(2, 2) == "46" ? kApnTelenor : kApnDefault;
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

void QuectelEC25::provision(bool dry_run) {
  std::string iccid = parseIccid(at_.cmd("AT+QCCID", 3000));
  std::string apn = apnForIccid(iccid);
  if (apn.empty()) {
    std::fprintf(stderr,
                 "ctt-modem-provision: Quectel — no usable ICCID (got '%s') — "
                 "leaving APN untouched\n",
                 iccid.c_str());
    return; // fail open — never guess an APN
  }
  std::fprintf(stderr, "ctt-modem-provision: Quectel — ICCID cc %s -> APN '%s'\n",
               iccid.substr(2, 2).c_str(), apn.c_str());

  std::string cg = at_.cmd("AT+CGDCONT?", 3000);
  if (cg.find("+CGDCONT:") == std::string::npos) {
    std::fprintf(stderr,
                 "ctt-modem-provision: no +CGDCONT response ('%s') — leaving "
                 "modem untouched\n",
                 flattenReply(cg).c_str());
    return; // fail open
  }
  // We compare on the APN only — that divergence (attach APN != dial APN) is what
  // triggers cause-55. A modem already on the correct APN is left untouched (no
  // radio bounce), even if its PDP type differs; only a mis-APN'd context is
  // rewritten, and the rewrite sets the documented IPv4 type (kPdpType).
  std::string current = parseCgdcontApn(cg, 1);
  std::fprintf(stderr,
               "ctt-modem-provision: Quectel — CGDCONT CID1 APN '%s' (want '%s')\n",
               current.c_str(), apn.c_str());

  if (current == apn) {
    std::fprintf(stderr, "ctt-modem-provision: Quectel — attach APN already "
                         "correct; no NV write\n");
    publishApn(apn); // still publish so the NM side has the source of truth
    return;
  }

  if (dry_run) {
    std::fprintf(stderr,
                 "ctt-modem-provision: --dry-run — would write CFUN=0 / "
                 "CGDCONT=1,\"%s\",\"%s\" / CFUN=1, then publish %s\n",
                 kPdpType, apn.c_str(), apn_file_.c_str());
    return;
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
    return;                     // fail open
  }
  at_.cmd("AT+CFUN=1", 5000);
  std::fprintf(stderr,
               "ctt-modem-provision: Quectel — attach APN set to '%s'; radio "
               "re-attaching (MM brings the wwan0 bearer up)\n",
               apn.c_str());
  publishApn(apn);
}

} // namespace ctthw

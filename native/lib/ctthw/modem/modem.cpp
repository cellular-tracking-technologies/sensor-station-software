#include "modem/modem.h"

#include <cctype>
#include <cstdio>
#include <string>

#include "modem/quectel_ec25.h"
#include "modem/telit_le910q1.h"

namespace ctthw {

Modem::~Modem() = default;

namespace {
std::string toLower(std::string s) {
  for (char &c : s)
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return s;
}
} // namespace

std::unique_ptr<Modem> makeModem(AtTransport &at) {
  std::string mfg = toLower(at.cmd("AT+CGMI", 3000));
  if (mfg.find("quectel") != std::string::npos) {
    std::fprintf(stderr, "ctt-modem-provision: manufacturer = Quectel\n");
    return std::make_unique<QuectelEC25>(at);
  }
  // Telit or unknown/empty -> Telit driver (fail-open; the Telit provisioner
  // itself no-ops on an unexpected response).
  std::fprintf(stderr, "ctt-modem-provision: manufacturer = %s -> Telit driver\n",
               mfg.empty() ? "(unknown)" : flattenReply(mfg).c_str());
  return std::make_unique<TelitLE910Q1>(at);
}

} // namespace ctthw

// Unit tests for the ctthw modem module. Dependency-free (no gtest): a tiny CHECK
// macro, a ScriptedAt transport that returns canned AT replies and records the
// command sequence, and fixtures taken from real modem responses. Runs natively
// (x86) via `make test` — no hardware, no cross-compile.

#include <cstdio>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "modem/at_port.h"
#include "modem/modem.h"
#include "modem/quectel_ec25.h"
#include "modem/telit_le910q1.h"

namespace {

int g_checks = 0, g_failures = 0;
#define CHECK(cond)                                                            \
  do {                                                                         \
    ++g_checks;                                                                \
    if (!(cond)) {                                                             \
      ++g_failures;                                                            \
      std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);     \
    }                                                                          \
  } while (0)

// Scripted AT transport: exact-command -> canned reply; unmatched commands get a
// bare OK. Records every command so tests can assert the issued sequence.
class ScriptedAt : public ctthw::AtTransport {
public:
  std::vector<std::string> log;
  std::map<std::string, std::string> replies;

  std::string cmd(const std::string &at, int) override {
    log.push_back(at);
    auto it = replies.find(at);
    return it != replies.end() ? it->second : "\r\nOK\r\n";
  }
  bool issued(const std::string &at) const {
    for (const auto &c : log)
      if (c == at)
        return true;
    return false;
  }
};

std::string readFile(const std::string &path) {
  std::ifstream f(path);
  std::stringstream ss;
  ss << f.rdbuf();
  std::string s = ss.str();
  while (!s.empty() && (s.back() == '\n' || s.back() == '\r'))
    s.pop_back();
  return s;
}

using ctthw::QuectelEC25;
using ctthw::TelitLE910Q1;

// ---- Telit parsers --------------------------------------------------------------
void test_telit_parsers() {
  CHECK(TelitLE910Q1::parseUsbcfg("\r\n#USBCFG: 1\r\n\r\nOK\r\n") == 1);
  CHECK(TelitLE910Q1::parseUsbcfg("\r\n#USBCFG: 0\r\n\r\nOK\r\n") == 0);
  CHECK(TelitLE910Q1::parseUsbcfg("\r\nERROR\r\n") == -1);
  CHECK(TelitLE910Q1::parseEcmBound("\r\n#ECM: 0,1\r\n\r\nOK\r\n") == true);
  CHECK(TelitLE910Q1::parseEcmBound("\r\n#ECM: 0,0\r\n\r\nOK\r\n") == false);
  CHECK(TelitLE910Q1::parseEcmBound("\r\nERROR\r\n") == false);
}

// ---- Quectel parsers / mapping --------------------------------------------------
void test_quectel_parsers() {
  // ICCID: digits after "+QCCID:". cc = digits [2:4]; "46" -> Telenor.
  CHECK(QuectelEC25::parseIccid("\r\n+QCCID: 8946071500000000001\r\n\r\nOK\r\n") ==
        "8946071500000000001");
  CHECK(QuectelEC25::parseIccid("\r\nERROR\r\n").empty());

  CHECK(QuectelEC25::apnForIccid("8946071500000000001") == "internet.cxn"); // cc 46
  CHECK(QuectelEC25::apnForIccid("8988280666000000001") == "super");        // cc 88
  CHECK(QuectelEC25::apnForIccid("").empty());                              // too short
  CHECK(QuectelEC25::apnForIccid("89").empty());

  // CGDCONT CID1 APN = 2nd quoted field on the CID-1 line.
  const std::string cg =
      "\r\n+CGDCONT: 1,\"IPV4V6\",\"super\",\"0.0.0.0\",0,0,0,0\r\n"
      "+CGDCONT: 2,\"IPV4V6\",\"ims\",\"\",0,0\r\n\r\nOK\r\n";
  CHECK(QuectelEC25::parseCgdcontApn(cg, 1) == "super");
  CHECK(QuectelEC25::parseCgdcontApn(cg, 2) == "ims");
  CHECK(QuectelEC25::parseCgdcontApn(cg, 3).empty()); // undefined context
}

// ---- makeModem dispatch (AT+CGMI) ----------------------------------------------
void test_dispatch() {
  {
    ScriptedAt at;
    at.replies["AT+CGMI"] = "\r\nQuectel\r\n\r\nOK\r\n";
    CHECK(std::string(ctthw::makeModem(at)->name()) == "Quectel EC25");
  }
  {
    ScriptedAt at;
    at.replies["AT+CGMI"] = "\r\nTelit\r\n\r\nOK\r\n";
    CHECK(std::string(ctthw::makeModem(at)->name()) == "Telit LE910Q1");
  }
  {
    ScriptedAt at; // empty/unknown -> Telit (fail-open default)
    CHECK(std::string(ctthw::makeModem(at)->name()) == "Telit LE910Q1");
  }
}

// ---- Quectel provision: the cause-55 heal --------------------------------------
void test_quectel_provision_divergence() {
  const std::string apnFile = "/tmp/ctt-test-modem-apn-diverge";
  std::remove(apnFile.c_str());

  ScriptedAt at;
  at.replies["AT+QCCID"] = "\r\n+QCCID: 8946071500000000001\r\n\r\nOK\r\n"; // Telenor
  at.replies["AT+CGDCONT?"] =
      "\r\n+CGDCONT: 1,\"IPV4V6\",\"super\",\"0.0.0.0\",0,0\r\n\r\nOK\r\n"; // wrong APN

  QuectelEC25 q(at, apnFile);
  q.provision(/*dry_run=*/false);

  // Heals: detach, rewrite CID1 to the SIM's APN (IPv4 per kPdpType), re-attach.
  CHECK(at.issued("AT+CFUN=0"));
  CHECK(at.issued("AT+CGDCONT=1,\"IP\",\"internet.cxn\""));
  CHECK(at.issued("AT+CFUN=1"));
  // And publishes the same APN for the NM side.
  CHECK(readFile(apnFile) == "internet.cxn");
  std::remove(apnFile.c_str());
}

// ---- Quectel provision: already correct = no NV write --------------------------
void test_quectel_provision_idempotent() {
  const std::string apnFile = "/tmp/ctt-test-modem-apn-idem";
  std::remove(apnFile.c_str());

  ScriptedAt at;
  at.replies["AT+QCCID"] = "\r\n+QCCID: 8946071500000000001\r\n\r\nOK\r\n";
  at.replies["AT+CGDCONT?"] =
      "\r\n+CGDCONT: 1,\"IPV4V6\",\"internet.cxn\",\"0.0.0.0\",0,0\r\n\r\nOK\r\n";

  QuectelEC25 q(at, apnFile);
  q.provision(/*dry_run=*/false);

  CHECK(!at.issued("AT+CFUN=0")); // no radio bounce
  CHECK(!at.issued("AT+CGDCONT=1,\"IP\",\"internet.cxn\"")); // no NV write
  CHECK(readFile(apnFile) == "internet.cxn"); // still publishes the source of truth
  std::remove(apnFile.c_str());
}

// ---- Quectel provision: blank CID1 left alone (policy B) -----------------------
void test_quectel_provision_blank() {
  const std::string apnFile = "/tmp/ctt-test-modem-apn-blank";
  std::remove(apnFile.c_str());

  ScriptedAt at;
  at.replies["AT+QCCID"] = "\r\n+QCCID: 8946071500000000001\r\n\r\nOK\r\n"; // Telenor
  at.replies["AT+CGDCONT?"] = // CID1 APN is blank -> network default, leave alone
      "\r\n+CGDCONT: 1,\"IPV4V6\",\"\",\"0.0.0.0\",0,0\r\n\r\nOK\r\n";

  QuectelEC25 q(at, apnFile);
  q.provision(/*dry_run=*/false);

  CHECK(!at.issued("AT+CFUN=0"));                              // no radio bounce
  CHECK(!at.issued("AT+CGDCONT=1,\"IP\",\"internet.cxn\""));   // no NV write
  CHECK(readFile(apnFile) == "internet.cxn");                 // but dial APN still published
  std::remove(apnFile.c_str());
}

// ---- Quectel provision: unreadable ICCID = leave everything alone --------------
void test_quectel_provision_bad_iccid() {
  const std::string apnFile = "/tmp/ctt-test-modem-apn-bad";
  std::remove(apnFile.c_str());

  ScriptedAt at;
  at.replies["AT+QCCID"] = "\r\nERROR\r\n";
  at.replies["AT+CGDCONT?"] =
      "\r\n+CGDCONT: 1,\"IPV4V6\",\"super\",\"0.0.0.0\",0,0\r\n\r\nOK\r\n";

  QuectelEC25 q(at, apnFile);
  q.provision(/*dry_run=*/false);

  CHECK(!at.issued("AT+CFUN=0"));
  CHECK(std::ifstream(apnFile).good() == false); // never guessed / never published
  std::remove(apnFile.c_str());
}

// ---- Quectel provision: dry-run never writes -----------------------------------
void test_quectel_provision_dryrun() {
  const std::string apnFile = "/tmp/ctt-test-modem-apn-dry";
  std::remove(apnFile.c_str());

  ScriptedAt at;
  at.replies["AT+QCCID"] = "\r\n+QCCID: 8946071500000000001\r\n\r\nOK\r\n";
  at.replies["AT+CGDCONT?"] =
      "\r\n+CGDCONT: 1,\"IPV4V6\",\"super\",\"0.0.0.0\",0,0\r\n\r\nOK\r\n";

  QuectelEC25 q(at, apnFile);
  q.provision(/*dry_run=*/true);

  CHECK(!at.issued("AT+CFUN=0"));
  CHECK(!at.issued("AT+CGDCONT=1,\"IP\",\"internet.cxn\""));
  CHECK(std::ifstream(apnFile).good() == false);
  std::remove(apnFile.c_str());
}

} // namespace

int main() {
  test_telit_parsers();
  test_quectel_parsers();
  test_dispatch();
  test_quectel_provision_divergence();
  test_quectel_provision_idempotent();
  test_quectel_provision_blank();
  test_quectel_provision_bad_iccid();
  test_quectel_provision_dryrun();

  std::fprintf(stderr, "\n%d checks, %d failures\n", g_checks, g_failures);
  return g_failures == 0 ? 0 : 1;
}

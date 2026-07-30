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

// ---- Telit provision: one-boot ECM convergence ---------------------------------
void test_telit_provision() {
  using ctthw::ProvisionResult;
  // Fresh RNDIS (USBCFG=0): switch composition + reboot, and signal RebootedRetry so
  // the executable re-runs on the re-enumerated ECM port to finish the bind.
  {
    ScriptedAt at;
    at.replies["AT#USBCFG?"] = "\r\n#USBCFG: 0\r\n\r\nOK\r\n";
    TelitLE910Q1 t(at);
    CHECK(t.provision(/*dry_run=*/false) == ProvisionResult::RebootedRetry);
    CHECK(at.issued("AT#USBCFG=1"));
    CHECK(at.issued("AT#REBOOT"));
    CHECK(!at.issued("AT#ECM=1,0")); // bind deferred to the post-reboot re-run
  }
  // ECM composition, unbound: bind now and report Done (the re-run's Stage 2).
  {
    ScriptedAt at;
    at.replies["AT#USBCFG?"] = "\r\n#USBCFG: 1\r\n\r\nOK\r\n";
    at.replies["AT#ECM?"] = "\r\n#ECM: 0,0\r\n\r\nOK\r\n";
    TelitLE910Q1 t(at);
    CHECK(t.provision(/*dry_run=*/false) == ProvisionResult::Done);
    CHECK(at.issued("AT#ECM=1,0"));
  }
  // ECM composition, already bound: no NV write, Done.
  {
    ScriptedAt at;
    at.replies["AT#USBCFG?"] = "\r\n#USBCFG: 1\r\n\r\nOK\r\n";
    at.replies["AT#ECM?"] = "\r\n#ECM: 0,1\r\n\r\nOK\r\n";
    TelitLE910Q1 t(at);
    CHECK(t.provision(/*dry_run=*/false) == ProvisionResult::Done);
    CHECK(!at.issued("AT#ECM=1,0"));
  }
  // dry-run on fresh RNDIS: reports intent, reboots nothing, returns Done (never
  // RebootedRetry — a dry-run must not trigger the executable's reboot-wait).
  {
    ScriptedAt at;
    at.replies["AT#USBCFG?"] = "\r\n#USBCFG: 0\r\n\r\nOK\r\n";
    TelitLE910Q1 t(at);
    CHECK(t.provision(/*dry_run=*/true) == ProvisionResult::Done);
    CHECK(!at.issued("AT#USBCFG=1"));
    CHECK(!at.issued("AT#REBOOT"));
  }
}

// ---- Quectel parsers / mapping --------------------------------------------------
void test_quectel_parsers() {
  // ICCID: digits after "+QCCID:". cc = digits [2:4]; "46" -> Telenor.
  CHECK(QuectelEC25::parseIccid("\r\n+QCCID: 8946071500000000001\r\n\r\nOK\r\n") ==
        "8946071500000000001");
  CHECK(QuectelEC25::parseIccid("\r\nERROR\r\n").empty());

  // Telenor issuer prefixes: Swedish 8946… and US 890124008… (8901 + PLMN 24008).
  CHECK(QuectelEC25::isTelenorIccid("8946071500000000001"));  // Swedish
  CHECK(QuectelEC25::isTelenorIccid("89012400800088627441")); // US (F5C51E6B6AFA)
  CHECK(!QuectelEC25::isTelenorIccid("8988280666000000001")); // Twilio Super
  // Bare "8901" must NOT match — 964 Kore SIMs live there (fleet-validated 2026-07-30).
  CHECK(!QuectelEC25::isTelenorIccid("8901260852391558350")); // Kore 890126…
  CHECK(!QuectelEC25::isTelenorIccid("8901240110000000000")); // Kore 890124011…
  CHECK(QuectelEC25::apnForIccid("8946071500000000001") == "internet.cxn");
  CHECK(QuectelEC25::apnForIccid("8988280666000000001") == "super");
  CHECK(QuectelEC25::apnForIccid("").empty());                              // too short
  CHECK(QuectelEC25::apnForIccid("89").empty());

  // IMSI: AT+CIMI answers with the bare IMSI (no "+CIMI:" prefix).
  CHECK(QuectelEC25::parseImsi("\r\n240080008862744\r\n\r\nOK\r\n") ==
        "240080008862744");
  CHECK(QuectelEC25::parseImsi("\r\nERROR\r\n").empty());
  CHECK(QuectelEC25::parseImsi("\r\nOK\r\n").empty());
  // A short digit run (not an IMSI) must not be mistaken for one.
  CHECK(QuectelEC25::parseImsi("\r\n12345\r\n\r\nOK\r\n").empty());

  // IMSI -> APN: recognized Telenor PLMN, else "" so the caller falls back.
  CHECK(QuectelEC25::isTelenorImsi("240080008862744"));      // MCC 240 / MNC 08
  CHECK(!QuectelEC25::isTelenorImsi("901405500000000"));     // Twilio Super SIM
  CHECK(QuectelEC25::apnForImsi("240080008862744") == "internet.cxn");
  CHECK(QuectelEC25::apnForImsi("901405500000000").empty()); // unknown -> fall back
  CHECK(QuectelEC25::apnForImsi("").empty());
  CHECK(QuectelEC25::apnForImsi("2400").empty());            // too short

  // chooseApn: IMSI wins; ICCID is the fallback.
  //
  // The regression this fix exists for: a Telenor SIM issued in an 8901
  // (US-numbered) ICCID range. ICCID cc reads "01" -> the old cc-only rule said
  // `super` and the network refused the bearer with 3GPP cause 33
  // (option-unsubscribed). Real values from V2 station F5C51E6B6AFA (2026-07-29).
  // The IMSI says Telenor -> internet.cxn regardless of the ICCID:
  CHECK(QuectelEC25::chooseApn("240080008862744", "89012400800088627441") ==
        "internet.cxn");
  // The ICCID fallback now also resolves it, via the hardened 890124008 prefix,
  // when no IMSI is available:
  CHECK(QuectelEC25::apnForIccid("89012400800088627441") == "internet.cxn");
  // Telenor-numbered ICCID: both sources agree.
  CHECK(QuectelEC25::chooseApn("240080008862744", "8946071500000000001") ==
        "internet.cxn");
  // Super SIM: IMSI unrecognized -> ICCID decides.
  CHECK(QuectelEC25::chooseApn("901405500000000", "8988280666000000001") == "super");
  // No IMSI at all (modem won't report one) -> ICCID decides.
  CHECK(QuectelEC25::chooseApn("", "8946071500000000001") == "internet.cxn");
  CHECK(QuectelEC25::chooseApn("", "89012400800088627441") == "internet.cxn"); // US Telenor
  CHECK(QuectelEC25::chooseApn("", "8988280666000000001") == "super");
  CHECK(QuectelEC25::chooseApn("", "8901260852391558350") == "super"); // Kore 890126 — no collision
  // Neither usable -> "" so provision() fails open instead of guessing.
  CHECK(QuectelEC25::chooseApn("", "").empty());

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

// ---- Quectel provision: Telenor SIM in an 8901 ICCID range (the cause-33 bug) ---
// End-to-end guard for the regression: before the IMSI-first fix, this SIM's ICCID
// cc "01" selected `super`, the modem attached on a blank CID1 but the network
// refused the dial with 3GPP cause 33 (option-unsubscribed), and the station lost
// cellular on every boot. Real values from V2 station F5C51E6B6AFA (2026-07-29).
void test_quectel_provision_telenor_us_iccid() {
  const std::string apnFile = "/tmp/ctt-test-modem-apn-telenor-us";
  std::remove(apnFile.c_str());

  ScriptedAt at;
  at.replies["AT+CIMI"] = "\r\n240080008862744\r\n\r\nOK\r\n";   // Telenor Sweden
  at.replies["AT+QCCID"] =
      "\r\n+QCCID: 89012400800088627441\r\n\r\nOK\r\n";          // 8901 -> cc "01"
  at.replies["AT+CGDCONT?"] = // blank CID1, exactly as observed on the station
      "\r\n+CGDCONT: 1,\"IPV4V6\",\"\",\"0.0.0.0\",0,0\r\n\r\nOK\r\n";

  QuectelEC25 q(at, apnFile);
  q.provision(/*dry_run=*/false);

  CHECK(at.issued("AT+CIMI"));                                 // IMSI is consulted
  CHECK(!at.issued("AT+CFUN=0"));                              // blank CID1: no bounce
  CHECK(readFile(apnFile) == "internet.cxn");                  // NOT "super"
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
  test_telit_provision();
  test_quectel_parsers();
  test_dispatch();
  test_quectel_provision_divergence();
  test_quectel_provision_telenor_us_iccid();
  test_quectel_provision_idempotent();
  test_quectel_provision_blank();
  test_quectel_provision_bad_iccid();
  test_quectel_provision_dryrun();

  std::fprintf(stderr, "\n%d checks, %d failures\n", g_checks, g_failures);
  return g_failures == 0 ? 0 : 1;
}

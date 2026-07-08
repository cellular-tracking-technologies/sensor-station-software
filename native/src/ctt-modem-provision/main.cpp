// ctt-modem-provision — bring up the Telit LE910Q1 CDC-ECM data path, self-
// healing across the field.
//
// The cellular data interface (mdm0, ECM self-NAT) requires two things:
//
//   1. USB composition = ECM (AT#USBCFG=1, USB id 1bc7:7021). This is a durable
//      NV setting: written once here and it survives reboots. USBCFG=0 is the
//      legacy RNDIS composition (1bc7:7020) — a field modem swap, an RMA unit,
//      or a manufacturing default can leave a modem on the wrong composition.
//
//   2. An active ECM session (AT#ECM=<cid>,<did>). UNLIKE the old RNDIS NV
//      binding, the ECM session is NOT persistent — a modem power-cycle drops
//      it (AT#ECM? reads "x,0"), so it must be re-started on EVERY boot. That
//      is why this tool is back on the boot path (ctt-modem-provision.service,
//      Before=ModemManager) after the RNDIS era removed it.
//
// Flow (idempotent, FAILS OPEN — any problem logs and exits 0 so boot proceeds
// and ModemManager starts normally):
//
//   read AT#USBCFG?  -> not 1 : AT#USBCFG=1 + AT#REBOOT, exit (re-enumerates as
//                               ECM/7021; the next boot continues below)
//                    -> 1     : composition already ECM, continue
//   read AT#ECM?     -> "x,1" : session already up, nothing to do
//                    -> "x,0" : AT#ECM=1,0, retrying for up to ~30s to ride out
//                               the registration race at cold boot (no reboot)
//
// It runs on the udev-symlinked AT control port /dev/ctt-modem-at (interface
// 02), ordered Before=ModemManager, so it has the port to itself.
//
// Usage: ctt-modem-provision [device-path]   (default /dev/ctt-modem-at)
//        ctt-modem-provision --dry-run        report state, never write
//        ctt-modem-provision --version

#include <cstdio>
#include <cstring>
#include <string>

#include <fcntl.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
#include <sys/select.h>

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

namespace {

constexpr const char *kDefaultPort = "/dev/ctt-modem-at";
// The AT port symlink is created by the same udev rule that pulls this service;
// wait briefly for it to settle rather than racing udev.
constexpr int kPortWaitMs = 8000;
// ECM session start rides out the cold-boot registration race: AT#ECM fails
// until the modem attaches, so retry for this long before giving up (fail open;
// the next boot re-runs, and MM keeps the AT port for signal/registration).
constexpr int kEcmStartWindowMs = 30000;
constexpr int kEcmRetryMs = 3000;
// At early boot the AT port can exist before the modem firmware answers; poll
// plain "AT" for OK this long before giving up.
constexpr int kReadyWindowMs = 25000;
constexpr int kReadyRetryMs = 2000;
// The PDP context the ECM session binds, and the ECM device id.
constexpr const char *kEcmStart = "AT#ECM=1,0";

long nowMs() {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}

// Open the AT port raw at 115200, 8N1, no flow control. CDC-ACM ignores the
// baud, but the line must be raw so the modem's responses arrive verbatim.
int openPort(const char *path) {
  int fd = ::open(path, O_RDWR | O_NOCTTY);
  if (fd < 0)
    return -1;
  struct termios t;
  if (tcgetattr(fd, &t) == 0) {
    cfmakeraw(&t);
    cfsetispeed(&t, B115200);
    cfsetospeed(&t, B115200);
    t.c_cflag |= (CLOCAL | CREAD); // no HUPCL — must not toggle DTR on this port
    t.c_cc[VMIN] = 0;
    t.c_cc[VTIME] = 0;
    tcsetattr(fd, TCSANOW, &t);
  }
  tcflush(fd, TCIOFLUSH);
  return fd;
}

// Send one AT command and accumulate the reply until a final result code
// (OK / ERROR / +CME ERROR) or the timeout. Returns the raw reply text.
std::string atCmd(int fd, const std::string &cmd, int timeout_ms) {
  std::string line = cmd + "\r";
  if (::write(fd, line.data(), line.size()) < 0)
    return "";
  std::string resp;
  long deadline = nowMs() + timeout_ms;
  char buf[256];
  while (nowMs() < deadline) {
    fd_set rfds;
    FD_ZERO(&rfds);
    FD_SET(fd, &rfds);
    long rem = deadline - nowMs();
    if (rem < 0)
      rem = 0;
    struct timeval tv{rem / 1000, (rem % 1000) * 1000};
    if (::select(fd + 1, &rfds, nullptr, nullptr, &tv) <= 0)
      continue;
    int n = ::read(fd, buf, sizeof(buf));
    if (n <= 0)
      continue;
    resp.append(buf, n);
    if (resp.find("\r\nOK\r\n") != std::string::npos ||
        resp.find("ERROR") != std::string::npos)
      break;
  }
  return resp;
}

// Strip CR/LF and collapse to a single line for tidy logging.
std::string oneLine(const std::string &s) {
  std::string out;
  for (char c : s) {
    if (c == '\r' || c == '\n')
      out += (out.empty() || out.back() == ' ') ? "" : " ";
    else
      out += c;
  }
  return out;
}

// "#USBCFG: <n>" — return n, or -1 if not present/parseable.
int parseUsbcfg(const std::string &resp) {
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

// "#ECM: <did>,<state>" — connected iff the second field (state) is non-zero.
bool ecmConnected(const std::string &resp) {
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

bool portPresent(const char *path) { return ::access(path, F_OK) == 0; }

} // namespace

int main(int argc, char **argv) {
  std::string port = kDefaultPort;
  bool dry_run = false;
  for (int i = 1; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "--version") {
      std::puts(CTT_VERSION);
      return 0;
    } else if (a == "--dry-run") {
      dry_run = true;
    } else {
      port = a;
    }
  }

  // Wait briefly for the udev-created symlink (same rule that pulls this unit).
  for (long deadline = nowMs() + kPortWaitMs;
       !portPresent(port.c_str()) && nowMs() < deadline;)
    usleep(200 * 1000);

  int fd = openPort(port.c_str());
  if (fd < 0) {
    std::fprintf(stderr,
                 "ctt-modem-provision: %s not present — no Telit AT port; "
                 "nothing to do\n",
                 port.c_str());
    return 0; // fail open
  }

  // ---- 0. Wait for the modem AT interface to be responsive. ----
  // At early boot (this runs Before=ModemManager) the port can exist while the
  // modem firmware is still initializing, so AT commands come back ERROR. Poll
  // plain "AT" until OK before issuing anything that matters.
  {
    bool ready = false;
    long deadline = nowMs() + kReadyWindowMs;
    do {
      if (atCmd(fd, "AT", 1500).find("OK") != std::string::npos) {
        ready = true;
        break;
      }
      usleep(kReadyRetryMs * 1000);
    } while (nowMs() < deadline);
    if (!ready) {
      std::fprintf(stderr, "ctt-modem-provision: modem not AT-responsive after "
                           "%d ms — failing open; retried next boot\n",
                   kReadyWindowMs);
      ::close(fd);
      return 0; // fail open
    }
  }

  // ---- 1. USB composition must be ECM (USBCFG=1). ----
  std::string cfg = atCmd(fd, "AT#USBCFG?", 3000);
  int usbcfg = parseUsbcfg(cfg);
  if (usbcfg < 0) {
    std::fprintf(stderr,
                 "ctt-modem-provision: no #USBCFG response ('%s') — leaving "
                 "modem untouched\n",
                 oneLine(cfg).c_str());
    ::close(fd);
    return 0; // fail open
  }
  std::fprintf(stderr, "ctt-modem-provision: AT#USBCFG? -> %d [%s]\n", usbcfg,
               oneLine(cfg).c_str());

  if (usbcfg != 1) {
    if (dry_run) {
      std::fprintf(stderr, "ctt-modem-provision: --dry-run — would set "
                           "AT#USBCFG=1 then AT#REBOOT (ECM composition)\n");
      ::close(fd);
      return 0;
    }
    std::fprintf(stderr, "ctt-modem-provision: switching composition to ECM "
                         "(AT#USBCFG=1)\n");
    std::string w = atCmd(fd, "AT#USBCFG=1", 5000);
    if (w.find("OK") == std::string::npos) {
      std::fprintf(stderr,
                   "ctt-modem-provision: USBCFG write not confirmed ('%s') — "
                   "NOT rebooting\n",
                   oneLine(w).c_str());
      ::close(fd);
      return 0; // fail open: don't reboot on an unconfirmed write
    }
    std::fprintf(stderr, "ctt-modem-provision: rebooting modem to apply the ECM "
                         "composition (AT#REBOOT)\n");
    atCmd(fd, "AT#REBOOT", 5000);
    ::close(fd);
    std::fprintf(stderr, "ctt-modem-provision: modem rebooting; it will "
                         "re-enumerate as ECM 1bc7:7021 (session started next "
                         "boot)\n");
    return 0;
  }

  // ---- 2. Start the ECM session (non-persistent; needed every boot). ----
  std::string ecm = atCmd(fd, "AT#ECM?", 3000);
  if (ecmConnected(ecm)) {
    std::fprintf(stderr,
                 "ctt-modem-provision: ECM session already up [%s] — done\n",
                 oneLine(ecm).c_str());
    ::close(fd);
    return 0;
  }
  std::fprintf(stderr, "ctt-modem-provision: ECM session down [%s] — starting\n",
               oneLine(ecm).c_str());

  if (dry_run) {
    std::fprintf(stderr, "ctt-modem-provision: --dry-run — would run %s "
                         "(retrying until registered)\n",
                 kEcmStart);
    ::close(fd);
    return 0;
  }

  // AT#ECM fails until the modem attaches to the network, so retry through the
  // cold-boot registration race. Fail open when the window elapses.
  long deadline = nowMs() + kEcmStartWindowMs;
  for (;;) {
    std::string w = atCmd(fd, kEcmStart, 6000);
    if (w.find("OK") != std::string::npos) {
      std::string chk = atCmd(fd, "AT#ECM?", 3000);
      std::fprintf(stderr, "ctt-modem-provision: %s -> OK; AT#ECM? [%s]\n",
                   kEcmStart, oneLine(chk).c_str());
      ::close(fd);
      return 0;
    }
    if (nowMs() >= deadline) {
      std::fprintf(stderr,
                   "ctt-modem-provision: ECM not up after %d ms (last: '%s') — "
                   "failing open; retried next boot\n",
                   kEcmStartWindowMs, oneLine(w).c_str());
      ::close(fd);
      return 0;
    }
    usleep(kEcmRetryMs * 1000);
  }
}

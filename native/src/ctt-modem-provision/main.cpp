// ctt-modem-provision — ensure the Telit LE910Q1 ECM data path is provisioned,
// self-healing across the field.
//
// The cellular data interface (mdm0, a cdc_ether NAT netdev) requires two durable
// NV settings on the modem:
//   1. USB composition = ECM:  AT#USBCFG must read "1" (ECM, VID:PID 1bc7:7021),
//      not "0" (RNDIS, 1bc7:7020) or "50" (no ports). Switching it re-enumerates
//      the modem (a reboot), so it is done first and the tool exits; the ECM bind
//      happens on the next invocation, once the modem is in ECM composition.
//   2. ECM session bound to a PDP context:  AT#ECM must read "x,1" (bound to
//      context 1), not "x,0" (unbound).
//
// We migrated the data path RNDIS -> ECM: RNDIS is deprecated in the Linux kernel
// and cannot be managed by ModemManager, whereas ECM is standards-based and gave a
// clean single mdm0 path in bench validation (2026-07-08). Existing field modems
// ship in RNDIS (USBCFG=0); this tool migrates them (set USBCFG=1, reboot, bind ECM).
//
//   read AT#USBCFG?  -> not "1"  : AT#USBCFG=1 + AT#REBOOT, exit (re-enumerates as
//                                  ECM; the ECM bind runs on the next invocation)
//                    -> "1"      : proceed to the ECM bind check
//   read AT#ECM?     -> bound    : nothing to do (read-only happy path)
//                    -> unbound  : AT#ECM=1,0 (immediate; no reboot needed)
//
// Runs on the udev-symlinked AT control port /dev/ctt-modem-at (USB interface 02,
// present in BOTH the RNDIS and ECM compositions), so it can reach a modem in either
// state. It is idempotent and FAILS OPEN: any problem opening/parsing the port logs
// and exits 0 so the boot proceeds and ModemManager starts normally. AT#IPPASSTH is
// left untouched (NAT mode carries data fine; verified on hardware).
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

// "#ECM: <a>,<b>" — bound iff the second field (the PDP context id) is non-zero.
bool ecmBound(const std::string &resp) {
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

// "#USBCFG: <n>" — parse the mode integer, or -1 if unparseable (0=RNDIS, 1=ECM).
int usbcfgMode(const std::string &resp) {
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

  // ---- Stage 1: ensure the ECM USB composition (AT#USBCFG=1). ----
  std::string u = atCmd(fd, "AT#USBCFG?", 3000);
  int mode = usbcfgMode(u);
  if (mode < 0) {
    std::fprintf(stderr,
                 "ctt-modem-provision: no #USBCFG response ('%s') — leaving "
                 "modem untouched\n",
                 oneLine(u).c_str());
    ::close(fd);
    return 0; // fail open
  }
  if (mode != 1) {
    std::fprintf(stderr,
                 "ctt-modem-provision: USBCFG=%d (not ECM) [%s]\n", mode,
                 oneLine(u).c_str());
    if (dry_run) {
      std::fprintf(stderr, "ctt-modem-provision: --dry-run — would write "
                           "AT#USBCFG=1 then AT#REBOOT\n");
      ::close(fd);
      return 0;
    }
    std::string w = atCmd(fd, "AT#USBCFG=1", 5000);
    if (w.find("OK") == std::string::npos) {
      std::fprintf(stderr,
                   "ctt-modem-provision: USBCFG write not confirmed ('%s') — "
                   "NOT rebooting\n",
                   oneLine(w).c_str());
      ::close(fd);
      return 0; // fail open
    }
    std::fprintf(stderr, "ctt-modem-provision: switching to ECM composition; "
                         "rebooting modem (AT#REBOOT)\n");
    atCmd(fd, "AT#REBOOT", 5000);
    ::close(fd);
    std::fprintf(stderr, "ctt-modem-provision: modem rebooting into ECM "
                         "(1bc7:7021); the ECM bind runs on the next invocation\n");
    return 0;
  }

  // ---- Stage 2: ensure the ECM session is bound (AT#ECM=1,0). ----
  std::string e = atCmd(fd, "AT#ECM?", 3000);
  if (e.find("#ECM:") == std::string::npos) {
    std::fprintf(stderr,
                 "ctt-modem-provision: no #ECM response ('%s') — leaving modem "
                 "untouched\n",
                 oneLine(e).c_str());
    ::close(fd);
    return 0; // fail open
  }

  bool bound = ecmBound(e);
  std::fprintf(stderr, "ctt-modem-provision: ECM composition OK; AT#ECM? -> %s [%s]\n",
               bound ? "bound (provisioned)" : "UNBOUND (needs binding)",
               oneLine(e).c_str());

  if (bound) {
    ::close(fd);
    return 0; // happy path: read-only, never touch a healthy modem's NV
  }

  if (dry_run) {
    std::fprintf(stderr, "ctt-modem-provision: --dry-run — would write "
                         "AT#ECM=1,0\n");
    ::close(fd);
    return 0;
  }

  std::fprintf(stderr, "ctt-modem-provision: binding ECM to PDP context 1 "
                       "(AT#ECM=1,0)\n");
  std::string w = atCmd(fd, "AT#ECM=1,0", 5000);
  if (w.find("OK") == std::string::npos) {
    std::fprintf(stderr,
                 "ctt-modem-provision: ECM bind not confirmed ('%s')\n",
                 oneLine(w).c_str());
    ::close(fd);
    return 0; // fail open
  }
  std::fprintf(stderr, "ctt-modem-provision: ECM bound (mdm0 will carry data "
                       "once ModemManager/NM bring it up)\n");
  ::close(fd);
  return 0;
}

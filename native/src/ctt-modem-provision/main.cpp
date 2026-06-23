// ctt-modem-provision — ensure the Telit LE910Q1 RNDIS data path is bound,
// self-healing across the field.
//
// The cellular data interface (mdm0, RNDIS NAT) only forwards once the modem's
// RNDIS session is bound to a PDP context: AT#RNDIS must read "x,1" (bound to
// context 1), not "x,0" (unbound). That binding is a durable NV setting written
// once at manufacturing — but a carrier/Telit firmware update, a field modem
// swap, or an RMA replacement can leave a modem unbound. Rather than predict
// every such case, this tool re-asserts the binding on boot:
//
//   read AT#RNDIS?  ->  bound ("x,1")    : nothing to do (read-only happy path)
//                   ->  unbound ("x,0")  : AT#RNDIS=1,0 + AT#REBOOT, then exit
//                                          (the modem re-enumerates already
//                                          bound; ModemManager picks it up)
//
// It runs BEFORE ModemManager (oneshot, ordered Before=ModemManager.service),
// on the udev-symlinked AT control port /dev/ctt-modem-at, so it has the port to
// itself — no ModemManager --debug round-trip, no contention. It is idempotent
// and FAILS OPEN: any problem opening/parsing the port logs and exits 0 so the
// boot proceeds and ModemManager starts normally. AT#IPPASSTH and AT#USBCFG are
// deliberately left untouched (proven unnecessary: NAT mode carries data fine,
// and the stock USB composition already exposes RNDIS).
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

// "#RNDIS: <a>,<b>" — bound iff the second field (the PDP context id) is non-zero.
bool isBound(const std::string &resp) {
  auto p = resp.find("#RNDIS:");
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

  std::string r = atCmd(fd, "AT#RNDIS?", 3000);
  if (r.find("#RNDIS:") == std::string::npos) {
    std::fprintf(stderr,
                 "ctt-modem-provision: no #RNDIS response ('%s') — leaving "
                 "modem untouched\n",
                 oneLine(r).c_str());
    ::close(fd);
    return 0; // fail open
  }

  bool bound = isBound(r);
  std::fprintf(stderr, "ctt-modem-provision: AT#RNDIS? -> %s [%s]\n",
               bound ? "bound (provisioned)" : "UNBOUND (needs provisioning)",
               oneLine(r).c_str());

  if (bound) {
    ::close(fd);
    return 0; // happy path: read-only, never touch a healthy modem's NV
  }

  if (dry_run) {
    std::fprintf(stderr, "ctt-modem-provision: --dry-run — would write "
                         "AT#RNDIS=1,0 then AT#REBOOT\n");
    ::close(fd);
    return 0;
  }

  std::fprintf(stderr,
               "ctt-modem-provision: binding RNDIS to PDP context 1 "
               "(AT#RNDIS=1,0)\n");
  std::string w = atCmd(fd, "AT#RNDIS=1,0", 5000);
  if (w.find("OK") == std::string::npos) {
    std::fprintf(stderr,
                 "ctt-modem-provision: write not confirmed ('%s') — NOT "
                 "rebooting\n",
                 oneLine(w).c_str());
    ::close(fd);
    return 0; // fail open: don't reboot on an unconfirmed write
  }

  std::fprintf(stderr, "ctt-modem-provision: rebooting modem to apply the NV "
                       "binding (AT#REBOOT)\n");
  atCmd(fd, "AT#REBOOT", 5000);
  ::close(fd);
  std::fprintf(stderr, "ctt-modem-provision: modem rebooting; it will "
                       "re-enumerate bound (verified next boot)\n");
  return 0;
}

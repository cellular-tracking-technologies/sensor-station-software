#include "modem/at_port.h"

#include <stdexcept>

#include <fcntl.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
#include <sys/select.h>

namespace ctthw {

namespace {

long nowMs() {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}

bool portPresent(const char *path) { return ::access(path, F_OK) == 0; }

// Open raw at 115200, 8N1, no flow control, and — critically — no HUPCL, so we
// never toggle DTR on this port (which some modem AT ports treat as a hang-up).
int openRaw(const char *path) {
  int fd = ::open(path, O_RDWR | O_NOCTTY);
  if (fd < 0)
    return -1;
  struct termios t;
  if (tcgetattr(fd, &t) == 0) {
    cfmakeraw(&t);
    cfsetispeed(&t, B115200);
    cfsetospeed(&t, B115200);
    t.c_cflag |= (CLOCAL | CREAD);
    t.c_cc[VMIN] = 0;
    t.c_cc[VTIME] = 0;
    tcsetattr(fd, TCSANOW, &t);
  }
  tcflush(fd, TCIOFLUSH);
  return fd;
}

} // namespace

std::string flattenReply(const std::string &s) {
  std::string out;
  for (char c : s) {
    if (c == '\r' || c == '\n')
      out += (out.empty() || out.back() == ' ') ? "" : " ";
    else
      out += c;
  }
  return out;
}

AtTransport::~AtTransport() = default;

AtPort::AtPort(const std::string &path, int wait_ms) : path_(path) {
  // The AT-port symlink is created by the same udev rule that pulls this unit;
  // wait briefly for it to settle rather than racing udev.
  for (long deadline = nowMs() + wait_ms;
       !portPresent(path_.c_str()) && nowMs() < deadline;)
    usleep(200 * 1000);

  fd_ = openRaw(path_.c_str());
  if (fd_ < 0)
    throw std::runtime_error("AtPort: cannot open " + path_);
}

AtPort::~AtPort() {
  if (fd_ >= 0)
    ::close(fd_);
}

std::string AtPort::cmd(const std::string &at, int timeout_ms) {
  std::string line = at + "\r";
  if (::write(fd_, line.data(), line.size()) < 0)
    return "";
  std::string resp;
  long deadline = nowMs() + timeout_ms;
  char buf[256];
  while (nowMs() < deadline) {
    fd_set rfds;
    FD_ZERO(&rfds);
    FD_SET(fd_, &rfds);
    long rem = deadline - nowMs();
    if (rem < 0)
      rem = 0;
    struct timeval tv{rem / 1000, (rem % 1000) * 1000};
    if (::select(fd_ + 1, &rfds, nullptr, nullptr, &tv) <= 0)
      continue;
    int n = ::read(fd_, buf, sizeof(buf));
    if (n <= 0)
      continue;
    resp.append(buf, n);
    if (resp.find("\r\nOK\r\n") != std::string::npos ||
        resp.find("ERROR") != std::string::npos)
      break;
  }
  return resp;
}

} // namespace ctthw

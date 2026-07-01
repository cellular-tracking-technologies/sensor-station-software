// ctt-radio-driver — bridges one receiver serial port to an AF_UNIX socket
// (gpsd-style). Two framing modes (--framing), one binary serves both device
// classes:
//
//   line (default — 434 MHz radios): the serial stream is split on '\n' and each
//     line is wrapped in an NDJSON envelope to clients; NDJSON {op:...} commands
//     from clients are unwrapped and written to the serial port. LOSSY under
//     backpressure (a real-time beep stream prefers fresh data over complete).
//
//   raw (Blu receivers): a transparent, bidirectional BYTE pipe — serial bytes
//     go to the client verbatim and client bytes go to the serial verbatim (no
//     line splitting, no JSON envelope, no hello/bye). The binary, polled,
//     request/response Blu protocol stays entirely in the JS client, which just
//     does socket I/O instead of opening the tty. RELIABLE (non-lossy): on
//     client backpressure the driver PAUSES serial reads rather than dropping
//     bytes — request/response and firmware DFU cannot tolerate loss.

#include "serial_port.h"

#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <map>
#include <string>

#include <fcntl.h>
#include <signal.h>
#include <sys/epoll.h>
#include <sys/signalfd.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

#include <nlohmann/json.hpp>

using json = nlohmann::json;

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

namespace {

// A connected subscriber. Outbound data is queued in `out` and flushed when the
// socket is writable. `out` is capped so a slow/dead client can never make the
// driver buffer without bound or stall the serial read.
struct Client {
  int fd = -1;
  std::string in;          // partial inbound line accumulator
  std::string out;         // pending outbound bytes
  bool want_write = false; // currently registered for EPOLLOUT
  uint64_t dropped = 0;    // messages dropped due to backpressure
};

constexpr size_t kClientOutCap = 1u << 20; // 1 MiB per-client outbound cap

// --dtr: how to drive the DTR line after opening. Keep (default) leaves it at the
// tty default (asserted) — byte-for-byte the prior behavior for the 434 radios.
// Clear de-asserts DTR, which a BluSeries receiver needs to run (asserted DTR
// holds newer hardware in reset). Assert is explicit-hold, for completeness.
enum class DtrMode { Keep, Assert, Clear };

struct Options {
  std::string serial;
  std::string socket;
  std::string id = "radio";
  std::string dev_class = "ctt-radio";
  int baud = 115200;
  bool raw = false;              // --framing raw: transparent byte pipe (Blu); default line
  DtrMode dtr = DtrMode::Keep;   // --dtr keep|assert|clear (default: don't touch)
};

std::string nowIso() {
  std::time_t t = std::time(nullptr);
  std::tm tm{};
  gmtime_r(&t, &tm);
  char buf[32];
  std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
  return buf;
}

// Monotonic milliseconds — for the systemd watchdog ping cadence (wall-clock
// jumps from NTP must not affect it).
long nowMonoMs() {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}

void logMsg(const char *level, const std::string &msg) {
  // journald captures stderr when run under systemd.
  std::fprintf(stderr, "[%s] %s %s\n", level, nowIso().c_str(), msg.c_str());
}

bool parseArgs(int argc, char **argv, Options &opt) {
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    auto next = [&](std::string &dst) {
      if (i + 1 < argc) {
        dst = argv[++i];
        return true;
      }
      return false;
    };
    if (a == "--serial") {
      if (!next(opt.serial))
        return false;
    } else if (a == "--socket") {
      if (!next(opt.socket))
        return false;
    } else if (a == "--id") {
      if (!next(opt.id))
        return false;
    } else if (a == "--class") {
      if (!next(opt.dev_class))
        return false;
    } else if (a == "--baud") {
      std::string b;
      if (!next(b))
        return false;
      opt.baud = std::atoi(b.c_str());
    } else if (a == "--framing") {
      std::string f;
      if (!next(f))
        return false;
      if (f == "raw")
        opt.raw = true;
      else if (f == "line")
        opt.raw = false;
      else {
        logMsg("error", "unknown --framing (want line|raw): " + f);
        return false;
      }
    } else if (a == "--dtr") {
      std::string d;
      if (!next(d))
        return false;
      if (d == "keep")
        opt.dtr = DtrMode::Keep;
      else if (d == "assert")
        opt.dtr = DtrMode::Assert;
      else if (d == "clear")
        opt.dtr = DtrMode::Clear;
      else {
        logMsg("error", "unknown --dtr (want keep|assert|clear): " + d);
        return false;
      }
    } else {
      logMsg("error", "unknown argument: " + a);
      return false;
    }
  }
  return !opt.serial.empty() && !opt.socket.empty();
}

class Driver {
public:
  explicit Driver(Options opt) : opt_(std::move(opt)) {}
  ~Driver() { cleanup(); }

  int run() {
    if (!opt_serialOpen())
      return 1;
    if (!setupSignals())
      return 1;
    if (!setupListener())
      return 1;

    epoll_ = epoll_create1(EPOLL_CLOEXEC);
    if (epoll_ < 0) {
      logMsg("error", std::string("epoll_create1: ") + std::strerror(errno));
      return 1;
    }
    epollAdd(serial_.fd(), EPOLLIN);
    epollAdd(listen_fd_, EPOLLIN);
    epollAdd(sig_fd_, EPOLLIN);

    logMsg("info", std::string("ctt-radio-driver ") + CTT_VERSION +
                       " up: serial=" + opt_.serial + " socket=" + opt_.socket);

    // systemd watchdog: if WatchdogSec= is set on the unit, ping WATCHDOG=1 at
    // half the configured period so a HUNG driver (e.g. a blocking write that
    // never returns) is detected and killed+restarted — Restart= alone never
    // catches a hang. No-op when not run under a watchdog (WATCHDOG_USEC unset),
    // in which case epoll blocks indefinitely as before.
    setupNotify();
    long wd_ping_ms = -1;
    if (const char *usec = std::getenv("WATCHDOG_USEC")) {
      const long u = std::atol(usec);
      if (u > 0)
        wd_ping_ms = (u / 1000) / 2;
    }
    long last_ping = nowMonoMs();

    epoll_event events[64];
    while (!stop_) {
      const int timeout = (wd_ping_ms > 0) ? static_cast<int>(wd_ping_ms) : -1;
      const int n = epoll_wait(epoll_, events, 64, timeout);
      if (n < 0) {
        if (errno == EINTR)
          continue;
        logMsg("error", std::string("epoll_wait: ") + std::strerror(errno));
        break;
      }
      for (int i = 0; i < n; ++i) {
        const int fd = events[i].data.fd;
        const uint32_t ev = events[i].events;
        if (fd == sig_fd_) {
          clean_stop_ = true; // intended stop (SIGTERM/SIGINT) => exit 0
          stop_ = true;
        } else if (fd == serial_.fd()) {
          if (ev & (EPOLLERR | EPOLLHUP)) {
            // Serial loss is a failure to recover from, not a clean exit: leave
            // clean_stop_ false so we exit non-zero and Restart=on-failure
            // relaunches. (A tty glitch that HUPs without a fresh enumeration
            // would otherwise leave the channel silently down.)
            logMsg("warn", "serial error/hup; exiting non-zero for restart");
            stop_ = true;
          } else if (ev & EPOLLIN) {
            onSerialReadable();
          }
        } else if (fd == listen_fd_) {
          onAcceptable();
        } else {
          onClientEvent(fd, ev);
        }
      }
      // Pet the watchdog after servicing events and on every timeout tick.
      if (wd_ping_ms > 0) {
        const long now = nowMonoMs();
        if (now - last_ping >= wd_ping_ms) {
          sdNotify("WATCHDOG=1");
          last_ping = now;
        }
      }
    }

    broadcastBye("shutdown");
    logMsg("info", clean_stop_ ? "driver down (clean stop)"
                               : "driver down (serial failure; will restart)");
    return clean_stop_ ? 0 : 1;
  }

private:
  bool opt_serialOpen() {
    if (!serial_.open(opt_.serial, opt_.baud)) {
      logMsg("error", "open serial " + opt_.serial + ": " + std::strerror(errno));
      return false;
    }
    // Drive DTR if requested. open() asserts DTR by default; clearing it frees a
    // BluSeries receiver that the assert would otherwise hold in reset. A DTR
    // ioctl failure is non-fatal (device may not expose modem lines) — log and go.
    if (opt_.dtr != DtrMode::Keep) {
      const bool assert = (opt_.dtr == DtrMode::Assert);
      if (serial_.setDtr(assert))
        logMsg("info", std::string("DTR ") + (assert ? "asserted" : "cleared"));
      else
        logMsg("warn", std::string("could not set DTR ") +
                           (assert ? "asserted" : "cleared") + ": " +
                           std::strerror(errno));
    }
    return true;
  }

  bool setupSignals() {
    sigset_t mask;
    sigemptyset(&mask);
    sigaddset(&mask, SIGINT);
    sigaddset(&mask, SIGTERM);
    sigaddset(&mask, SIGPIPE); // never want SIGPIPE on a dead client socket
    if (sigprocmask(SIG_BLOCK, &mask, nullptr) != 0)
      return false;
    sigdelset(&mask, SIGPIPE); // SIGPIPE stays blocked, not delivered via fd
    sig_fd_ = signalfd(-1, &mask, SFD_NONBLOCK | SFD_CLOEXEC);
    if (sig_fd_ < 0) {
      logMsg("error", std::string("signalfd: ") + std::strerror(errno));
      return false;
    }
    return true;
  }

  bool setupListener() {
    listen_fd_ = socket(AF_UNIX, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
    if (listen_fd_ < 0) {
      logMsg("error", std::string("socket: ") + std::strerror(errno));
      return false;
    }
    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    if (opt_.socket.size() >= sizeof(addr.sun_path)) {
      logMsg("error", "socket path too long");
      return false;
    }
    std::strncpy(addr.sun_path, opt_.socket.c_str(), sizeof(addr.sun_path) - 1);

    ::unlink(opt_.socket.c_str()); // clear a stale socket from a prior run
    if (bind(listen_fd_, reinterpret_cast<sockaddr *>(&addr), sizeof(addr)) != 0) {
      logMsg("error", "bind " + opt_.socket + ": " + std::strerror(errno));
      return false;
    }
    bound_ = true;
    if (listen(listen_fd_, 16) != 0) {
      logMsg("error", std::string("listen: ") + std::strerror(errno));
      return false;
    }
    return true;
  }

  void epollAdd(int fd, uint32_t events) {
    epoll_event ev{};
    ev.events = events;
    ev.data.fd = fd;
    epoll_ctl(epoll_, EPOLL_CTL_ADD, fd, &ev);
  }

  void epollMod(int fd, uint32_t events) {
    epoll_event ev{};
    ev.events = events;
    ev.data.fd = fd;
    epoll_ctl(epoll_, EPOLL_CTL_MOD, fd, &ev);
  }

  void onAcceptable() {
    for (;;) {
      const int cfd = accept4(listen_fd_, nullptr, nullptr, SOCK_NONBLOCK | SOCK_CLOEXEC);
      if (cfd < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK)
          break;
        if (errno == EINTR)
          continue;
        logMsg("warn", std::string("accept4: ") + std::strerror(errno));
        break;
      }
      Client c;
      c.fd = cfd;
      clients_.emplace(cfd, std::move(c));
      epollAdd(cfd, EPOLLIN);
      if (!opt_.raw)
        sendHello(cfd); // raw is a byte pipe — no JSON hello into the stream
      logMsg("info", "client connected");
      maybeResumeSerial(); // a fresh (empty) client lets serial resume if paused
    }
  }

  void sendHello(int fd) {
    json dev = {{"id", opt_.id}, {"class", opt_.dev_class}, {"baud", opt_.baud}};
    json msg = {{"t", "hello"}, {"device", dev}, {"ts", nowIso()}};
    enqueue(fd, msg.dump());
  }

  void onSerialReadable() {
    char buf[4096];
    for (;;) {
      const ssize_t n = serial_.readAvailable(buf, sizeof(buf));
      if (n > 0) {
        if (opt_.raw) {
          broadcastRaw(buf, static_cast<size_t>(n)); // verbatim, no framing
        } else {
          serial_in_.append(buf, static_cast<size_t>(n));
          drainSerialLines();
        }
        if (static_cast<size_t>(n) < sizeof(buf))
          break;            // drained the kernel buffer for now
        if (serial_paused_) // raw backpressure: stop reading until client drains
          break;
      } else if (n == 0) {
        break; // EAGAIN
      } else {
        logMsg("warn", "serial read error; exiting for restart");
        stop_ = true;
        break;
      }
    }
  }

  // Split the serial accumulator on '\n', strip trailing '\r', emit each
  // complete line as an NDJSON `data` message to every client.
  void drainSerialLines() {
    size_t pos;
    while ((pos = serial_in_.find('\n')) != std::string::npos) {
      std::string line = serial_in_.substr(0, pos);
      serial_in_.erase(0, pos + 1);
      if (!line.empty() && line.back() == '\r')
        line.pop_back();
      if (line.empty())
        continue;
      json msg = {{"t", "data"}, {"line", line}, {"seq", ++seq_}, {"ts", nowIso()}};
      // error_handler::replace: a serial line with non-UTF-8/binary bytes would
      // otherwise make dump() THROW (uncaught -> the whole driver crashes). A
      // remote acquisition daemon must never die on garbage device input — emit
      // the line with the bad bytes replaced (U+FFFD) instead.
      broadcast(msg.dump(-1, ' ', false, json::error_handler_t::replace));
    }
    // Guard against an unbounded accumulator if a device never emits '\n'.
    if (serial_in_.size() > (1u << 16))
      serial_in_.clear();
  }

  void onClientEvent(int fd, uint32_t ev) {
    auto it = clients_.find(fd);
    if (it == clients_.end())
      return;
    if (ev & (EPOLLERR | EPOLLHUP)) {
      dropClient(fd, "hup");
      return;
    }
    if (ev & EPOLLOUT)
      flushClient(it->second);
    if (ev & EPOLLIN)
      onClientReadable(it->second);
  }

  void onClientReadable(Client &c) {
    char buf[4096];
    for (;;) {
      const ssize_t n = ::read(c.fd, buf, sizeof(buf));
      if (n > 0) {
        if (opt_.raw) {
          // Transparent: client bytes go straight to the serial port verbatim.
          if (!serial_.writeAll(buf, static_cast<size_t>(n)))
            logMsg("warn", std::string("raw: serial write failed: ") +
                               std::strerror(errno));
        } else {
          c.in.append(buf, static_cast<size_t>(n));
        }
        if (static_cast<size_t>(n) < sizeof(buf))
          break;
      } else if (n == 0) {
        dropClient(c.fd, "eof");
        return;
      } else {
        if (errno == EINTR)
          continue;
        if (errno == EAGAIN || errno == EWOULDBLOCK)
          break;
        dropClient(c.fd, "read error");
        return;
      }
    }
    if (opt_.raw)
      return; // no line framing / command parsing in raw mode
    size_t pos;
    while ((pos = c.in.find('\n')) != std::string::npos) {
      std::string line = c.in.substr(0, pos);
      c.in.erase(0, pos + 1);
      handleCommand(line);
    }
    if (c.in.size() > (1u << 16))
      c.in.clear();
  }

  // v1 command vocabulary: raw / tx / preset. Translate to a serial line and
  // write it. (reply correlation lands with protocol awareness.)
  void handleCommand(const std::string &line) {
    if (line.empty())
      return;
    json j;
    try {
      j = json::parse(line);
    } catch (const std::exception &) {
      logMsg("warn", "ignoring non-JSON command");
      return;
    }
    if (!j.is_object() || j.value("t", "") != "cmd")
      return;
    const std::string op = j.value("op", "");
    const std::string arg = j.value("arg", "");
    std::string wire;
    if (op == "raw")
      wire = arg;
    else if (op == "tx")
      wire = "tx:" + arg;
    else if (op == "preset")
      wire = "preset:" + arg;
    else {
      logMsg("warn", "unsupported op: " + op);
      return;
    }
    wire += "\r\n";
    if (!serial_.writeAll(wire.data(), wire.size()))
      logMsg("warn", std::string("serial write failed: ") + std::strerror(errno));
  }

  void broadcast(const std::string &payload) {
    for (auto &kv : clients_)
      enqueue(kv.first, payload);
  }

  // Raw mode: enqueue verbatim bytes to every client (no framing). Reliable —
  // never drops; instead pauses serial reads when a client backs up.
  void broadcastRaw(const char *data, size_t len) {
    for (auto &kv : clients_)
      enqueueRaw(kv.first, data, len);
  }

  void enqueueRaw(int fd, const char *data, size_t len) {
    auto it = clients_.find(fd);
    if (it == clients_.end())
      return;
    Client &c = it->second;
    c.out.append(data, len); // reliable: never drop request/response or DFU bytes
    if (!serial_paused_ && c.out.size() > kClientOutCap)
      pauseSerial(); // backpressure the device rather than drop
    flushClient(c);
  }

  // Pause/resume serial reads for raw backpressure. epoll still reports
  // EPOLLHUP/EPOLLERR even with an empty event mask, so serial loss is still
  // detected while paused.
  void pauseSerial() {
    if (serial_paused_)
      return;
    epollMod(serial_.fd(), 0);
    serial_paused_ = true;
    logMsg("warn", "raw: client backpressure — pausing serial reads");
  }
  void resumeSerial() {
    if (!serial_paused_)
      return;
    epollMod(serial_.fd(), EPOLLIN);
    serial_paused_ = false;
    logMsg("info", "raw: client drained — resuming serial reads");
  }

  // Resume serial reads if paused and no client is still backed up (or none
  // remain). Called when a client drains, disconnects, or connects, so the
  // driver can't wedge with serial paused after the backed-up client is gone.
  void maybeResumeSerial() {
    if (!serial_paused_)
      return;
    for (auto &kv : clients_)
      if (kv.second.out.size() >= kClientOutCap / 2)
        return;
    resumeSerial();
  }

  void broadcastBye(const char *reason) {
    if (opt_.raw)
      return; // raw is a byte pipe — no JSON bye into the stream
    json msg = {{"t", "bye"}, {"reason", reason}};
    broadcast(msg.dump());
    for (auto &kv : clients_)
      flushClient(kv.second); // best-effort final flush
  }

  // Append one NDJSON line to a client's outbound queue and try to flush.
  void enqueue(int fd, const std::string &payload) {
    auto it = clients_.find(fd);
    if (it == clients_.end())
      return;
    Client &c = it->second;
    if (c.out.size() + payload.size() + 1 > kClientOutCap) {
      ++c.dropped;
      if (c.dropped == 1 || (c.dropped % 1000) == 0)
        logMsg("warn", "client backpressure: dropped " + std::to_string(c.dropped) +
                           " messages");
      return; // drop rather than block the serial read
    }
    c.out.append(payload);
    c.out.push_back('\n');
    flushClient(c);
  }

  void flushClient(Client &c) {
    while (!c.out.empty()) {
      const ssize_t n = ::send(c.fd, c.out.data(), c.out.size(), MSG_NOSIGNAL);
      if (n > 0) {
        c.out.erase(0, static_cast<size_t>(n));
      } else if (n < 0 && errno == EINTR) {
        continue;
      } else if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
        break; // socket full — wait for EPOLLOUT
      } else {
        dropClient(c.fd, "write error");
        return;
      }
    }
    const bool need_write = !c.out.empty();
    if (need_write != c.want_write) {
      c.want_write = need_write;
      uint32_t events = EPOLLIN;
      if (need_write)
        events |= EPOLLOUT;
      epollMod(c.fd, events);
    }
    maybeResumeSerial(); // raw: unpause serial once backpressure clears
  }

  void dropClient(int fd, const char *reason) {
    auto it = clients_.find(fd);
    if (it == clients_.end())
      return;
    epoll_ctl(epoll_, EPOLL_CTL_DEL, fd, nullptr);
    ::close(fd);
    clients_.erase(it);
    logMsg("info", std::string("client disconnected: ") + reason);
    maybeResumeSerial(); // a backed-up client leaving must not leave serial paused
  }

  // systemd notify (raw, no libsystemd dep): open the $NOTIFY_SOCKET datagram
  // socket so sdNotify() can pet the watchdog. NOTIFY_SOCKET is either a
  // filesystem path or an abstract socket (leading '@' -> a NUL first byte).
  void setupNotify() {
    const char *path = std::getenv("NOTIFY_SOCKET");
    if (!path || !*path)
      return;
    const size_t plen = std::strlen(path);
    if (plen >= sizeof(notify_addr_.sun_path))
      return;
    notify_fd_ = socket(AF_UNIX, SOCK_DGRAM | SOCK_CLOEXEC, 0);
    if (notify_fd_ < 0)
      return;
    std::memset(&notify_addr_, 0, sizeof(notify_addr_));
    notify_addr_.sun_family = AF_UNIX;
    if (path[0] == '@') { // abstract namespace
      std::memcpy(notify_addr_.sun_path + 1, path + 1, plen - 1);
      notify_addr_len_ = offsetof(struct sockaddr_un, sun_path) + plen;
    } else {
      std::memcpy(notify_addr_.sun_path, path, plen);
      notify_addr_len_ = offsetof(struct sockaddr_un, sun_path) + plen + 1;
    }
  }

  void sdNotify(const char *state) {
    if (notify_fd_ < 0)
      return;
    ::sendto(notify_fd_, state, std::strlen(state), MSG_NOSIGNAL,
             reinterpret_cast<sockaddr *>(&notify_addr_), notify_addr_len_);
  }

  void cleanup() {
    for (auto &kv : clients_)
      ::close(kv.first);
    clients_.clear();
    if (epoll_ >= 0)
      ::close(epoll_);
    if (sig_fd_ >= 0)
      ::close(sig_fd_);
    if (listen_fd_ >= 0)
      ::close(listen_fd_);
    if (notify_fd_ >= 0)
      ::close(notify_fd_);
    if (bound_)
      ::unlink(opt_.socket.c_str());
  }

  Options opt_;
  SerialPort serial_;
  int epoll_ = -1;
  int listen_fd_ = -1;
  int sig_fd_ = -1;
  bool bound_ = false;
  bool stop_ = false;
  bool clean_stop_ = false;    // true => intended stop (signal) => exit 0
  bool serial_paused_ = false; // raw mode: serial reads paused for backpressure
  int notify_fd_ = -1;
  struct sockaddr_un notify_addr_ {};
  socklen_t notify_addr_len_ = 0;
  uint64_t seq_ = 0;
  std::string serial_in_;
  std::map<int, Client> clients_;
};

} // namespace

int main(int argc, char **argv) {
  for (int i = 1; i < argc; ++i) {
    if (std::string(argv[i]) == "--version") {
      std::puts(CTT_VERSION);
      return 0;
    }
  }
  Options opt;
  if (!parseArgs(argc, argv, opt)) {
    std::fprintf(stderr,
                 "usage: ctt-radio-driver --serial PATH --socket PATH "
                 "[--baud N] [--id STR] [--class STR] [--framing line|raw] "
                 "[--dtr keep|assert|clear]\n");
    return 2;
  }
  Driver driver(std::move(opt));
  return driver.run();
}

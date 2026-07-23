#pragma once

#include <string>

namespace ctthw {

// Collapse CR/LF runs to single spaces so a multi-line AT reply logs on one line.
std::string flattenReply(const std::string &s);

// AtTransport — the narrow seam between modem provisioning logic and the wire.
// Modems talk to hardware only through this interface, so provisioning can be
// driven by a scripted fake in unit tests (no serial port, no hardware). The one
// real implementation is AtPort below.
class AtTransport {
public:
  virtual ~AtTransport();
  // Send one AT command and return the raw reply verbatim, accumulated until a
  // final result code (OK/ERROR) or timeout_ms. May be empty/partial on a
  // non-responding modem — callers parse defensively. Never throws.
  virtual std::string cmd(const std::string &at, int timeout_ms) = 0;
};

// AtPort — RAII wrapper over a modem AT control port (e.g. /dev/ctt-modem-at).
// Waits for the udev symlink to appear, opens it raw 8N1 (CDC-ACM / usb-serial
// ignore the baud, but the line discipline must be raw so bytes arrive verbatim),
// and closes on destruction. Throws std::runtime_error if the port never appears
// or cannot be opened — the executable decides whether that is fatal (the
// provisioner treats it as fail-open and exits 0).
class AtPort : public AtTransport {
public:
  static constexpr int kDefaultWaitMs = 8000;

  explicit AtPort(const std::string &path, int wait_ms = kDefaultWaitMs);
  ~AtPort() override;
  AtPort(const AtPort &) = delete;
  AtPort &operator=(const AtPort &) = delete;

  std::string cmd(const std::string &at, int timeout_ms) override;

  const std::string &path() const { return path_; }

private:
  std::string path_;
  int fd_ = -1;
};

} // namespace ctthw

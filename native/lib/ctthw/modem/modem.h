#pragma once

#include <memory>

#include "modem/at_port.h"

namespace ctthw {

// Outcome of a provision() pass.
enum class ProvisionResult {
  Done,          // finished (or a fail-open no-op) — nothing more to do.
  RebootedRetry, // the modem was rebooted mid-provision (Telit RNDIS->ECM USB
                 // composition switch) and will re-enumerate. The executable waits
                 // for it to come back, reopens the AT port, and runs provision()
                 // again on the fresh port to finish — so it completes in ONE boot.
};

// Modem — abstract cellular modem driver. One subclass per family; each owns its
// own provisioning and shares only the AT transport:
//
//   TelitLE910Q1 — the CDC-ECM data path (AT#USBCFG / AT#ECM).
//   QuectelEC25  — the LTE attach APN (AT+CGDCONT CID1), matched to the SIM.
//
// Provisioning is idempotent and fail-open: provision() reads state first and only
// writes when needed, reporting progress on stderr; it never exits the process
// (the executable does). Modems hold an AtTransport&, so the same logic runs
// against real hardware (AtPort) or a scripted fake in tests.
class Modem {
public:
  explicit Modem(AtTransport &at) : at_(at) {}
  virtual ~Modem();
  Modem(const Modem &) = delete;
  Modem &operator=(const Modem &) = delete;

  // Human-readable family name (for logs).
  virtual const char *name() const = 0;

  // Bring the modem's data path / attach context to the desired state.
  // dry_run reports what it would do and makes no NV writes. Returns
  // RebootedRetry if it rebooted the modem and must be re-run after
  // re-enumeration (see ProvisionResult); Done otherwise.
  virtual ProvisionResult provision(bool dry_run) = 0;

protected:
  AtTransport &at_;
};

// Identify the attached modem via AT+CGMI and return the matching driver. A
// Quectel manufacturer string selects the Quectel driver; Telit — and any
// unrecognized or empty response — selects the Telit driver (fail-open, and it
// preserves the pre-refactor default). Always returns a non-null driver.
std::unique_ptr<Modem> makeModem(AtTransport &at);

} // namespace ctthw

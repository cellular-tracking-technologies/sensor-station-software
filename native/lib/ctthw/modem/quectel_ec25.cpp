#include "modem/quectel_ec25.h"

namespace ctthw {

ProvisionResult QuectelEC25::provision(bool dry_run) {
  // The Quectel is QMI-managed and needs no ECM/USB-composition work — its entire
  // job is the shared attach-APN heal (CGDCONT CID1 matched to the SIM).
  return provisionAttachApn(dry_run);
}

} // namespace ctthw

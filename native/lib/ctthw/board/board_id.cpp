#include "board/board_id.h"

#include <cstdio>
#include <stdexcept>

#include "chips/at24mac602.h"
#include "chips/atsha204a.h"
#include "chips/mcp79412.h"
#include "chips/sx1509b.h"

namespace ctthw {

namespace {

std::string toHexUpper(const std::vector<uint8_t> &bytes, std::size_t start = 0) {
  static const char *H = "0123456789ABCDEF";
  std::string s;
  for (std::size_t i = start; i < bytes.size(); ++i) {
    s += H[bytes[i] >> 4];
    s += H[bytes[i] & 0xF];
  }
  return s;
}

// V3 rev 1/2 id: "V3" + zero-padded (revision+1) + hex of the EUI-64 bytes
// {2,5,6,7}. (e.g. rev 2 -> "V303" + 8 hex chars)
std::string formatAt24Id(const std::vector<uint8_t> &eui, int revision) {
  std::vector<uint8_t> sliced = {eui[2], eui[5], eui[6], eui[7]};
  char prefix[16];
  std::snprintf(prefix, sizeof(prefix), "V3%02d", revision + 1);
  return std::string(prefix) + toHexUpper(sliced);
}

} // namespace

Identity detectIdentity(I2cBus &bus) {
  Identity out;
  Sx1509b expander(bus);

  if (expander.present()) {
    out.version = 3;
    expander.initialize(); // one-shot expander bring-up, then read the straps
    out.revision = expander.readRevision();
    switch (out.revision) {
    case 0:
    case 127:
      // V3 rev 0: id from the MCP79412 protected-EEPROM EUI-64 (bytes 3..8).
      out.id = "V3" + toHexUpper(Mcp79412(bus).readEui64(), 3);
      out.board = "v3r0";
      break;
    case 1:
      out.id = formatAt24Id(At24mac602(bus).readEui64(), out.revision);
      out.board = "v3r0";
      break;
    case 2:
      out.id = formatAt24Id(At24mac602(bus).readEui64(), out.revision);
      out.board = "v3r3";
      break;
    default:
      throw std::runtime_error("cannot identify station revision: " +
                               std::to_string(out.revision));
    }
  } else {
    out.version = 2;
    out.revision = 0;
    out.id = Atsha204a().serialNumber();
    out.board = "v2";
  }
  return out;
}

} // namespace ctthw

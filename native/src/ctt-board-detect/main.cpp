// ctt-board-detect — boot-time board detection + hardware identity for the CTT
// Sensor Station.
//
// Detects the board EVERY boot (so a compute-module swap between boards is
// handled — plug-n-play) and writes, drop-in compatible with the old Node
// initialize.js:
//   /etc/ctt/station-id              station id string
//   /etc/ctt/station-revision        version (2 or 3)
//   /etc/ctt/station-board-revision  hardware revision (0/1/2)
// plus, for udev, /run/ctt/board.env  ->  CTT_BOARD=v2|v3r0|v3r3
//
// All hardware logic lives in the ctthw library (I2cBus + chip drivers +
// board_id composition); this executable is a thin shell: parse flags, detect,
// write the files, and translate a library exception into a clean exit.
//
// Flags: --version, --dry-run (detect + print, write nothing).

#include <cerrno>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <string>

#include <sys/stat.h>

#include "board/board_id.h"

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

namespace {

void writeFile(const std::string &path, const std::string &content) {
  FILE *f = std::fopen(path.c_str(), "w");
  if (!f)
    throw std::runtime_error("open " + path + ": " + std::strerror(errno));
  std::fwrite(content.data(), 1, content.size(), f);
  std::fclose(f);
}

} // namespace

int main(int argc, char **argv) {
  bool dry_run = false;
  for (int i = 1; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "--version") {
      std::puts(CTT_VERSION);
      return 0;
    }
    if (a == "--dry-run")
      dry_run = true;
  }

  try {
    ctthw::I2cBus bus; // /dev/i2c-1
    ctthw::Identity id = ctthw::detectIdentity(bus);

    std::fprintf(stderr, "ctt-board-detect: version=%d revision=%d board=%s id=%s%s\n",
                 id.version, id.revision, id.board.c_str(), id.id.c_str(),
                 dry_run ? " (dry-run, nothing written)" : "");

    if (dry_run)
      return 0;

    ::mkdir("/etc/ctt", 0755);
    ::mkdir("/run/ctt", 0755);
    writeFile("/etc/ctt/station-id", id.id);
    writeFile("/etc/ctt/station-revision", std::to_string(id.version));
    writeFile("/etc/ctt/station-board-revision", std::to_string(id.revision));
    writeFile("/run/ctt/board.env", "CTT_BOARD=" + id.board + "\n");
    return 0;
  } catch (const std::exception &e) {
    std::fprintf(stderr, "ctt-board-detect: %s\n", e.what());
    return 1;
  }
}

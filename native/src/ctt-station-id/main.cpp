// ctt-station-id — boot-time hardware identity for the CTT Sensor Station.
//
// Detects the board EVERY boot (so a compute-module swap between boards is
// handled — plug-n-play) and writes, drop-in compatible with the old Node
// initialize.js:
//   /etc/ctt/station-id              station id string
//   /etc/ctt/station-revision        version (2 or 3)
//   /etc/ctt/station-board-revision  hardware revision (0/1/2)
// plus, for udev, /run/ctt/board.env  ->  CTT_BOARD=v2|v3r0|v3r3
//
// Logic ported faithfully from sensor-station-software/src/hardware/{id-driver,
// io-expander}:
//   - SX1509B IO-expander present at I2C 0x70  => V3, else V2.
//   - V3 revision = (~bankA & 0xFF) >> 1, after initializing the expander
//     (reset; pull-ups + input direction on config pins 1-7 and buttons 12-15).
//   - id:  V3 rev 0/127 -> DS3231 @0x57 reg 0xF0;  V3 rev 1/2 -> AT24MAC602 @0x58
//          reg 0x98 (EUI64);  V2 -> `hashlet serial-num`.
//
// Flags: --version, --dry-run (detect + print, write nothing).

#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include <fcntl.h>
#include <linux/i2c-dev.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

namespace {

constexpr const char *I2C_BUS = "/dev/i2c-1";
constexpr int ADDR_EXPANDER = 0x70;   // SX1509B
constexpr int ADDR_AT24MAC602 = 0x58; // serial EEPROM (EUI64)
constexpr int ADDR_DS3231_EE = 0x57;  // RTC companion EEPROM

[[noreturn]] void die(const std::string &msg) {
  std::fprintf(stderr, "ctt-station-id: %s\n", msg.c_str());
  std::exit(1);
}

// Minimal /dev/i2c-N helper using the register write-then-read pattern the JS
// i2c-bus calls (writeI2cBlock / readI2cBlock) compile down to.
class I2cBus {
public:
  explicit I2cBus(const char *path) {
    fd_ = ::open(path, O_RDWR);
    if (fd_ < 0)
      die(std::string("open ") + path + ": " + std::strerror(errno));
  }
  ~I2cBus() {
    if (fd_ >= 0)
      ::close(fd_);
  }

  // Probe by setting the address pointer; a missing device NAKs -> write fails.
  bool present(int addr, uint8_t reg) {
    if (::ioctl(fd_, I2C_SLAVE, addr) < 0)
      return false;
    return ::write(fd_, &reg, 1) == 1;
  }

  void writeReg(int addr, uint8_t reg, const std::vector<uint8_t> &bytes) {
    setSlave(addr);
    std::vector<uint8_t> buf;
    buf.reserve(1 + bytes.size());
    buf.push_back(reg);
    buf.insert(buf.end(), bytes.begin(), bytes.end());
    if (::write(fd_, buf.data(), buf.size()) != static_cast<ssize_t>(buf.size()))
      die("i2c write failed");
  }

  std::vector<uint8_t> readReg(int addr, uint8_t reg, size_t n) {
    setSlave(addr);
    if (::write(fd_, &reg, 1) != 1)
      die("i2c set-pointer failed");
    std::vector<uint8_t> buf(n);
    if (::read(fd_, buf.data(), n) != static_cast<ssize_t>(n))
      die("i2c read failed");
    return buf;
  }

private:
  void setSlave(int addr) {
    if (::ioctl(fd_, I2C_SLAVE, addr) < 0)
      die("i2c set-slave failed");
  }
  int fd_ = -1;
};

std::string toHexUpper(const std::vector<uint8_t> &bytes, size_t start = 0) {
  static const char *H = "0123456789ABCDEF";
  std::string s;
  for (size_t i = start; i < bytes.size(); ++i) {
    s += H[bytes[i] >> 4];
    s += H[bytes[i] & 0xF];
  }
  return s;
}

std::string runHashlet() {
  FILE *p = ::popen("hashlet serial-num", "r");
  if (!p)
    die("popen hashlet failed");
  std::string out;
  char buf[256];
  size_t n;
  while ((n = ::fread(buf, 1, sizeof(buf), p)) > 0)
    out.append(buf, n);
  ::pclose(p);
  while (!out.empty() &&
         (out.back() == '\n' || out.back() == '\r' || out.back() == ' '))
    out.pop_back();
  if (out.size() < 16)
    die("hashlet serial too short: '" + out + "'");
  return out.substr(4, 12); // mirrors id.substring(4, 16)
}

struct Identity {
  int version = 0;
  int revision = 0;
  std::string id;
  std::string board; // v2 | v3r0 | v3r3
};

// Initialize the SX1509B (config pins 1-7 -> bank A 0xFE, buttons 12-15 -> bank B
// 0xF0) and read bank A. revision = (~bankA & 0xFF) >> 1.
int readRevision(I2cBus &bus) {
  const uint8_t A_MASK = 0xFE, B_MASK = 0xF0;
  bus.writeReg(ADDR_EXPANDER, 0x71, {0x12, 0x34}); // RegReset
  bus.writeReg(ADDR_EXPANDER, 0x07, {A_MASK});     // RegPullUpA
  bus.writeReg(ADDR_EXPANDER, 0x06, {B_MASK});     // RegPullUpB
  bus.writeReg(ADDR_EXPANDER, 0x0F, {A_MASK});     // RegDirA  (1 = input)
  bus.writeReg(ADDR_EXPANDER, 0x0E, {B_MASK});     // RegDirB
  auto a = bus.readReg(ADDR_EXPANDER, 0x11, 1);    // RegDataA
  return ((~static_cast<unsigned>(a[0])) & 0xFF) >> 1;
}

std::string idFromAt24(I2cBus &bus, int revision) {
  auto eui = bus.readReg(ADDR_AT24MAC602, 0x98, 8); // EUI64
  std::vector<uint8_t> sliced = {eui[2], eui[5], eui[6], eui[7]};
  char prefix[16];
  std::snprintf(prefix, sizeof(prefix), "V3%02d", revision + 1);
  return std::string(prefix) + toHexUpper(sliced);
}

std::string idFromDs3231(I2cBus &bus) {
  auto buf = bus.readReg(ADDR_DS3231_EE, 0xF0, 8);
  return std::string("V3") + toHexUpper(buf, 3); // bytes[3..8]
}

Identity detect() {
  I2cBus bus(I2C_BUS);
  Identity out;
  if (bus.present(ADDR_EXPANDER, 0x11)) {
    out.version = 3;
    out.revision = readRevision(bus);
    switch (out.revision) {
    case 0:
    case 127:
      out.id = idFromDs3231(bus);
      out.board = "v3r0";
      break;
    case 1:
      out.id = idFromAt24(bus, out.revision);
      out.board = "v3r0";
      break;
    case 2:
      out.id = idFromAt24(bus, out.revision);
      out.board = "v3r3";
      break;
    default:
      die("cannot identify station revision: " + std::to_string(out.revision));
    }
  } else {
    out.version = 2;
    out.revision = 0;
    out.id = runHashlet();
    out.board = "v2";
  }
  return out;
}

void writeFile(const std::string &path, const std::string &content) {
  FILE *f = std::fopen(path.c_str(), "w");
  if (!f)
    die("open " + path + ": " + std::strerror(errno));
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

  Identity id = detect();

  std::fprintf(stderr, "ctt-station-id: version=%d revision=%d board=%s id=%s%s\n",
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
}

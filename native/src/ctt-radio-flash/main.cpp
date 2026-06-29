// ctt-radio-flash — flash a 434 MHz radio MCU (Adafruit Feather, ATmega32U4)
// via its Caterina/avr109 bootloader, GPIO-free.
//
// Method: the "1200-baud touch". Opening the radio's CDC-ACM port at 1200 baud
// makes the Caterina sketch reset the MCU into its bootloader, which re-
// enumerates on USB at the SAME physical port (a different product id) within a
// second or two. We then run avrdude against it. No reset GPIO is involved, so
// this works for every Feather channel — on-board or USB.
//
// The physical USB position is stable across the app<->bootloader re-enumeration,
// so we target the kernel's /dev/serial/by-path/<…> entry (which the app and the
// bootloader share) rather than the unstable /dev/ttyACM* number.
//
// The caller must free the port first (stop the channel's ctt-radio-driver@
// instance); program-radios.sh orchestrates that. The radio udev rule matches
// only the app product id, so the bootloader does not relaunch the driver and
// avrdude has the port to itself.
//
// Usage: ctt-radio-flash <channel-N | device-path> <firmware> [--dry-run]
//        ctt-radio-flash --version

#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
#include <sys/stat.h>
#include <termios.h>
#include <unistd.h>

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

namespace {

constexpr const char *kByPathDir = "/dev/serial/by-path";

std::string realpathStr(const std::string &p) {
  char buf[PATH_MAX];
  if (realpath(p.c_str(), buf))
    return buf;
  return "";
}

bool exists(const std::string &p) {
  struct stat st;
  return lstat(p.c_str(), &st) == 0;
}

// channel "N" / "chN" -> /dev/ctt-radio/chN; anything else is taken as a path.
std::string resolveDevice(const std::string &target) {
  std::string t = target;
  if (t.rfind("ch", 0) == 0)
    t = t.substr(2);
  bool numeric = !t.empty();
  for (char c : t)
    if (!isdigit(static_cast<unsigned char>(c)))
      numeric = false;
  if (numeric)
    return "/dev/ctt-radio/ch" + t;
  return target;
}

// Find the /dev/serial/by-path entry that resolves to the same device as `dev`.
// This name is the physical USB position and is reused by the bootloader.
std::string findByPath(const std::string &devReal) {
  DIR *d = opendir(kByPathDir);
  if (!d)
    return "";
  std::string out;
  struct dirent *e;
  while ((e = readdir(d))) {
    if (e->d_name[0] == '.')
      continue;
    std::string full = std::string(kByPathDir) + "/" + e->d_name;
    if (realpathStr(full) == devReal) {
      out = full;
      break;
    }
  }
  closedir(d);
  return out;
}

// 1200-baud touch: setting the CDC line coding to 1200 baud triggers Caterina to
// reset into the bootloader.
bool touch1200(const std::string &dev) {
  int fd = open(dev.c_str(), O_RDWR | O_NOCTTY | O_NONBLOCK);
  if (fd < 0)
    return false;
  struct termios t;
  if (tcgetattr(fd, &t) == 0) {
    cfmakeraw(&t);
    cfsetispeed(&t, B1200);
    cfsetospeed(&t, B1200);
    t.c_cflag |= (CLOCAL | CREAD | HUPCL); // HUPCL: drop DTR on close
    tcsetattr(fd, TCSANOW, &t);
  }
  usleep(300 * 1000);
  close(fd); // close drops DTR (HUPCL), reinforcing the reset
  return true;
}

// Poll `path` until pred(exists(path)) holds, or timeout. Returns true on match.
bool waitFor(const std::string &path, bool want, int timeout_ms) {
  const int step = 100;
  for (int t = 0; t < timeout_ms; t += step) {
    if (exists(path) == want)
      return true;
    usleep(step * 1000);
  }
  return false;
}

} // namespace

int main(int argc, char **argv) {
  std::string target, firmware;
  bool dry_run = false;
  for (int i = 1; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "--version") {
      std::puts(CTT_VERSION);
      return 0;
    } else if (a == "--dry-run") {
      dry_run = true;
    } else if (target.empty()) {
      target = a;
    } else if (firmware.empty()) {
      firmware = a;
    }
  }

  if (target.empty()) {
    std::fprintf(stderr,
                 "usage: ctt-radio-flash <channel-N | device-path> <firmware> "
                 "[--dry-run]\n");
    return 2;
  }

  std::string dev = resolveDevice(target);
  std::string devReal = realpathStr(dev);
  if (devReal.empty()) {
    std::fprintf(stderr, "ctt-radio-flash: %s not present\n", dev.c_str());
    return 1;
  }
  if (!dry_run) {
    if (firmware.empty()) {
      std::fprintf(stderr, "ctt-radio-flash: a firmware file is required\n");
      return 2;
    }
    if (!exists(firmware)) {
      std::fprintf(stderr, "ctt-radio-flash: firmware '%s' not found\n",
                   firmware.c_str());
      return 2;
    }
  }

  std::string byPath = findByPath(devReal);
  if (byPath.empty()) {
    std::fprintf(stderr,
                 "ctt-radio-flash: no /dev/serial/by-path entry for %s\n",
                 dev.c_str());
    return 1;
  }
  std::fprintf(stderr, "ctt-radio-flash: %s -> %s (%s)\n", target.c_str(),
               byPath.c_str(), devReal.c_str());

  // Touch, then watch the physical port disconnect (app) and reappear (boot).
  std::fprintf(stderr, "ctt-radio-flash: 1200-baud touch...\n");
  if (!touch1200(dev)) {
    std::fprintf(stderr, "ctt-radio-flash: could not open %s for the touch\n",
                 dev.c_str());
    return 1;
  }
  if (!waitFor(byPath, /*want=*/false, 5000)) {
    std::fprintf(stderr,
                 "ctt-radio-flash: port did not reset (no disconnect) — is the "
                 "driver still holding it?\n");
    return 1;
  }
  if (!waitFor(byPath, /*want=*/true, 10000)) {
    std::fprintf(stderr, "ctt-radio-flash: bootloader did not appear\n");
    return 1;
  }
  usleep(500 * 1000); // brief settle once the bootloader CDC is up
  std::fprintf(stderr, "ctt-radio-flash: bootloader up at %s (%s)\n",
               byPath.c_str(), realpathStr(byPath).c_str());

  if (dry_run) {
    std::fprintf(stderr, "ctt-radio-flash: --dry-run, not flashing\n");
    return 0;
  }

  // Hand off to avrdude (the proven flashing backend) against the bootloader.
  std::string uflash = "flash:w:" + firmware + ":i";
  std::vector<const char *> av = {"avrdude",      "-P", byPath.c_str(),
                                  "-c",           "avr109",
                                  "-patmega32u4", "-b", "57600",
                                  "-D",           "-v",
                                  "-U",           uflash.c_str(),
                                  nullptr};
  execvp("avrdude", const_cast<char *const *>(av.data()));
  std::perror("ctt-radio-flash: exec avrdude");
  return 127;
}

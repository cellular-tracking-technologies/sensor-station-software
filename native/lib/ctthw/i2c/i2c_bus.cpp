#include "i2c/i2c_bus.h"

#include <cerrno>
#include <cstring>
#include <stdexcept>

#include <fcntl.h>
#include <linux/i2c-dev.h>
#include <sys/file.h>
#include <sys/ioctl.h>
#include <unistd.h>

namespace ctthw {

namespace {
[[noreturn]] void fail(const std::string &what) {
  throw std::runtime_error(what + ": " + std::strerror(errno));
}
} // namespace

I2cBus::I2cBus(const std::string &path) {
  fd_ = ::open(path.c_str(), O_RDWR);
  if (fd_ < 0)
    fail("open " + path);
}

I2cBus::~I2cBus() {
  if (fd_ >= 0)
    ::close(fd_);
}

void I2cBus::lockBus() {
  // Advisory + best-effort: if flock is unavailable the worst case is the old
  // (un-serialized) behaviour, never a hard failure of the detection path.
  if (lock_depth_++ == 0)
    while (::flock(fd_, LOCK_EX) < 0 && errno == EINTR) {
    }
}

void I2cBus::unlockBus() {
  if (--lock_depth_ == 0)
    ::flock(fd_, LOCK_UN);
}

void I2cBus::setSlave(int addr) {
  if (::ioctl(fd_, I2C_SLAVE, addr) < 0)
    fail("i2c set-slave");
}

bool I2cBus::present(int addr, uint8_t reg) {
  Lock lk(*this);
  if (::ioctl(fd_, I2C_SLAVE, addr) < 0)
    return false;
  return ::write(fd_, &reg, 1) == 1;
}

void I2cBus::writeReg(int addr, uint8_t reg, const std::vector<uint8_t> &bytes) {
  setSlave(addr);
  std::vector<uint8_t> buf;
  buf.reserve(1 + bytes.size());
  buf.push_back(reg);
  buf.insert(buf.end(), bytes.begin(), bytes.end());
  if (::write(fd_, buf.data(), buf.size()) != static_cast<ssize_t>(buf.size()))
    fail("i2c write");
}

std::vector<uint8_t> I2cBus::readReg(int addr, uint8_t reg, std::size_t n) {
  setSlave(addr);
  if (::write(fd_, &reg, 1) != 1)
    fail("i2c set-pointer");
  std::vector<uint8_t> buf(n);
  if (::read(fd_, buf.data(), n) != static_cast<ssize_t>(n))
    fail("i2c read");
  return buf;
}

} // namespace ctthw

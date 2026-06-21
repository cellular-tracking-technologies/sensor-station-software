#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace ctthw {

// Minimal /dev/i2c-N wrapper using the register write-then-read pattern (the
// same shape the JS i2c-bus writeI2cBlock/readI2cBlock calls compile down to).
// Throws std::runtime_error on I/O failure — the library never exits the process
// (that's the executable's decision).
//
// Cross-process serialization: the I2C bus is shared by several tools that may
// run concurrently (board-detect at boot, a sensor daemon, an LED/LCD driver).
// The kernel only locks per-MESSAGE, so a multi-register sequence from one
// process can interleave with another's. Hold an I2cBus::Lock for the duration
// of a logical chip transaction (advisory flock over the bus device); nested
// Locks within one process are safe (depth-counted).
class I2cBus {
public:
  explicit I2cBus(const std::string &path = "/dev/i2c-1");
  ~I2cBus();
  I2cBus(const I2cBus &) = delete;
  I2cBus &operator=(const I2cBus &) = delete;

  // True if a device ACKs at addr (probe by setting the register pointer).
  // Self-locked (a complete one-shot transaction).
  bool present(int addr, uint8_t reg);

  // Register I/O building blocks. The CALLER must hold an I2cBus::Lock for the
  // duration of a multi-step sequence so it is atomic against other processes.
  void writeReg(int addr, uint8_t reg, const std::vector<uint8_t> &bytes);
  std::vector<uint8_t> readReg(int addr, uint8_t reg, std::size_t n);

  // Raw write of arbitrary bytes (no register/command prefix). For non-register
  // chips like the MAX11645 ADC, whose setup/config bytes are written directly.
  void writeBytes(int addr, const std::vector<uint8_t> &bytes);

  // RAII advisory lock over the whole bus for a chip transaction's duration.
  class Lock {
  public:
    explicit Lock(I2cBus &bus) : bus_(bus) { bus_.lockBus(); }
    ~Lock() { bus_.unlockBus(); }
    Lock(const Lock &) = delete;
    Lock &operator=(const Lock &) = delete;

  private:
    I2cBus &bus_;
  };

private:
  void setSlave(int addr);
  void lockBus();   // flock(LOCK_EX) on first acquisition
  void unlockBus(); // flock(LOCK_UN) when the last holder releases

  int fd_ = -1;
  int lock_depth_ = 0;
};

} // namespace ctthw

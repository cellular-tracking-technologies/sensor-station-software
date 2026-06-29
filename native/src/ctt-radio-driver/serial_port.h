#pragma once

#include <string>
#include <termios.h>

// A non-blocking serial port. Opens a tty, puts it in raw mode at the requested
// baud rate, and exposes non-blocking read/write. The caller drives I/O from an
// epoll loop; this class never blocks.
class SerialPort {
public:
  SerialPort() = default;
  ~SerialPort();

  SerialPort(const SerialPort &) = delete;
  SerialPort &operator=(const SerialPort &) = delete;

  // Opens and configures the port. Returns false on error (errno is set).
  bool open(const std::string &path, int baud);

  // Reads whatever is available into buf (up to len). Returns the number of
  // bytes read, 0 if nothing was available (EAGAIN), or -1 on a real error.
  ssize_t readAvailable(char *buf, size_t len);

  // Writes the whole buffer, retrying short writes. Returns true on success.
  // On EAGAIN it keeps trying (radio command volume is tiny, so a brief
  // blocking write is acceptable and keeps the command path simple).
  bool writeAll(const char *buf, size_t len);

  int fd() const { return fd_; }
  bool isOpen() const { return fd_ >= 0; }
  void close();

private:
  static speed_t toSpeed(int baud);

  int fd_ = -1;
};

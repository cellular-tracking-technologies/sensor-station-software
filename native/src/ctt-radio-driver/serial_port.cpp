#include "serial_port.h"

#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <unistd.h>

SerialPort::~SerialPort() { close(); }

speed_t SerialPort::toSpeed(int baud) {
  switch (baud) {
  case 9600:
    return B9600;
  case 19200:
    return B19200;
  case 38400:
    return B38400;
  case 57600:
    return B57600;
  case 115200:
    return B115200;
  case 230400:
    return B230400;
  default:
    return B0; // unsupported
  }
}

bool SerialPort::open(const std::string &path, int baud) {
  close();

  const speed_t speed = toSpeed(baud);
  if (speed == B0) {
    errno = EINVAL;
    return false;
  }

  // O_NONBLOCK so the open itself and subsequent reads never block; O_NOCTTY so
  // the tty does not become our controlling terminal.
  fd_ = ::open(path.c_str(), O_RDWR | O_NOCTTY | O_NONBLOCK);
  if (fd_ < 0) {
    return false;
  }

  termios tio{};
  if (tcgetattr(fd_, &tio) != 0) {
    close();
    return false;
  }

  cfmakeraw(&tio); // 8N1, no echo, no canonical/line processing
  cfsetispeed(&tio, speed);
  cfsetospeed(&tio, speed);

  tio.c_cflag |= (CLOCAL | CREAD); // ignore modem control lines, enable receiver
  tio.c_cflag &= ~CRTSCTS;         // no hardware flow control
  tio.c_iflag &= ~(IXON | IXOFF | IXANY); // no software flow control

  // Pure non-blocking: return immediately with whatever is available.
  tio.c_cc[VMIN] = 0;
  tio.c_cc[VTIME] = 0;

  if (tcsetattr(fd_, TCSANOW, &tio) != 0) {
    close();
    return false;
  }

  tcflush(fd_, TCIOFLUSH);
  return true;
}

ssize_t SerialPort::readAvailable(char *buf, size_t len) {
  for (;;) {
    const ssize_t n = ::read(fd_, buf, len);
    if (n >= 0) {
      return n;
    }
    if (errno == EINTR) {
      continue;
    }
    if (errno == EAGAIN || errno == EWOULDBLOCK) {
      return 0;
    }
    return -1;
  }
}

bool SerialPort::writeAll(const char *buf, size_t len) {
  size_t off = 0;
  while (off < len) {
    const ssize_t n = ::write(fd_, buf + off, len - off);
    if (n > 0) {
      off += static_cast<size_t>(n);
      continue;
    }
    if (n < 0 && errno == EINTR) {
      continue;
    }
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      continue; // tiny command volume — spin briefly rather than buffer
    }
    return false;
  }
  return true;
}

void SerialPort::close() {
  if (fd_ >= 0) {
    ::close(fd_);
    fd_ = -1;
  }
}

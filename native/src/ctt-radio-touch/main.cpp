// ctt-radio-touch — reset an Adafruit/Caterina ATmega32u4 board into its bootloader
// via the "1200-baud touch": open the CDC-ACM port at 1200 baud and close it (dropping
// DTR), which the Arduino core detects and uses to jump to the bootloader.
//
// This precise termios operation is the ONE step of radio flashing that must be native.
// All orchestration — resolving the channel, finding the stable /dev/serial/by-path
// entry, detecting app-vs-bootloader mode, waiting for re-enumeration, and running
// avrdude — lives in the shell (program-radio.sh), which calls this and hands off.
//
// Usage: ctt-radio-touch <device>   |   ctt-radio-touch --version
#include <cerrno>
#include <cstdio>
#include <cstring>

#include <fcntl.h>
#include <termios.h>
#include <unistd.h>

#ifndef CTT_VERSION
#define CTT_VERSION "0.0.0-dev"
#endif

int main(int argc, char **argv) {
  if (argc == 2 && std::strcmp(argv[1], "--version") == 0) {
    std::puts(CTT_VERSION);
    return 0;
  }
  if (argc != 2) {
    std::fprintf(stderr, "usage: ctt-radio-touch <device> | --version\n");
    return 2;
  }

  int fd = open(argv[1], O_RDWR | O_NOCTTY | O_NONBLOCK);
  if (fd < 0) {
    std::fprintf(stderr, "ctt-radio-touch: open %s: %s\n", argv[1],
                 std::strerror(errno));
    return 1;
  }

  struct termios t;
  if (tcgetattr(fd, &t) == 0) {
    cfmakeraw(&t);
    cfsetispeed(&t, B1200);
    cfsetospeed(&t, B1200);
    t.c_cflag |= (CLOCAL | CREAD | HUPCL); // HUPCL: drop DTR on close -> reset
    tcsetattr(fd, TCSANOW, &t);
  }
  usleep(300 * 1000);
  close(fd); // close drops DTR (HUPCL), triggering the bootloader jump
  return 0;
}

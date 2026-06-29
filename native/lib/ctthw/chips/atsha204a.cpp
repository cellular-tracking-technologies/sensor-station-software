#include "chips/atsha204a.h"

#include <cstddef>
#include <cstdio>
#include <stdexcept>

namespace ctthw {

std::string Atsha204a::serialNumber() {
  FILE *p = ::popen("hashlet serial-num", "r");
  if (!p)
    throw std::runtime_error("popen hashlet failed");
  std::string out;
  char buf[256];
  std::size_t n;
  while ((n = std::fread(buf, 1, sizeof(buf), p)) > 0)
    out.append(buf, n);
  ::pclose(p);
  while (!out.empty() &&
         (out.back() == '\n' || out.back() == '\r' || out.back() == ' '))
    out.pop_back();
  if (out.size() < 16)
    throw std::runtime_error("hashlet serial too short: '" + out + "'");
  return out.substr(4, 12); // mirrors the old id.substring(4, 16)
}

} // namespace ctthw

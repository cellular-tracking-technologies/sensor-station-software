# CMake toolchain: cross-compile the native tools for the sensor station.
#
# Target = 32-bit ARM, Debian "armhf" (ARMv7-A hard-float), glibc 2.31,
# Raspbian 11 (bullseye) on the Raspberry Pi CM3+ (armv7l). The matching
# arm-linux-gnueabihf toolchain is provided by docker/build.Dockerfile.

set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR arm)

set(CMAKE_C_COMPILER   arm-linux-gnueabihf-gcc)
set(CMAKE_CXX_COMPILER arm-linux-gnueabihf-g++)

# Static-link the GCC/libstdc++ runtimes: binaries depend only on the target's
# glibc (which the bullseye build base matches), not its libstdc++ minor version.
set(CMAKE_EXE_LINKER_FLAGS_INIT "-static-libstdc++ -static-libgcc")

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY BOTH)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE BOTH)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE BOTH)

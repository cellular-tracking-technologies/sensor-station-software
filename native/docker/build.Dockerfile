# Reproducible cross-build environment for the native/ C++ tools.
#
# Debian bullseye matches the sensor station's gcc-10 / glibc-2.31 ABI; the
# arm-linux-gnueabihf toolchain emits Debian-armhf (ARMv7-A hard-float) binaries
# that run on the station's armv7l CPU. bullseye is oldstable -> highly
# reproducible. Pin FROM by digest for byte-identical builds.
FROM debian:bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        cmake \
        make \
        file \
        g++-arm-linux-gnueabihf \
        nlohmann-json3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

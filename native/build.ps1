#!/usr/bin/env pwsh
# Reproducible armhf cross-build for Windows / PowerShell — the equivalent of
# `make arm`. Builds the native tools inside the pinned Debian bullseye toolchain
# image so the ABI matches the station fleet; binaries bind-mount out to build-arm\.
#
# Requires: Docker Desktop (WSL2 backend) running.   Usage:  pwsh ./build.ps1

$ErrorActionPreference = 'Stop'
$image = 'sensor-station-native-build'
$root  = $PSScriptRoot

Write-Host "==> building toolchain image ($image)"
docker build -t $image -f "$root/docker/build.Dockerfile" "$root/docker"
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "==> cross-compiling (armhf, bullseye)"
# Docker wants forward slashes in the bind path on Windows (D:/foo, not D:\foo).
$mount = $root -replace '\\', '/'
docker run --rm -v "${mount}:/src" -w /src $image `
  bash -c "cmake -S . -B build-arm -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-armhf-linux.cmake -DCMAKE_BUILD_TYPE=Release && cmake --build build-arm -j"
if ($LASTEXITCODE -ne 0) { throw "cross-compile failed" }

Write-Host "==> built:"
Get-ChildItem (Join-Path $root 'build-arm') -Filter 'ctt-*' -File | Where-Object { $_.Extension -eq '' }

#!/usr/bin/env bash
# Extract and diff the printable string tables of two radio-firmware .hex images.
# usage: ./fw-tokens.sh A.hex [B.hex]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tok() { python3 "$here/ihex2bin.py" "$1" "$2.bin" >/dev/null
        strings -n 3 "$2.bin" | grep -E '^[A-Za-z][A-Za-z0-9_:.,{}"\[\]-]*$' | sort -u > "$2.tok"; }
tok "$1" a
echo "=== $(basename "$1") ($(stat -c%s a.bin) bytes of flash) ==="
cat a.tok
[ $# -lt 2 ] && exit 0
tok "$2" b
echo; echo "=== $(basename "$2") ($(stat -c%s b.bin) bytes of flash) ==="; cat b.tok
echo; echo "=== only in $(basename "$1") ==="; comm -23 a.tok b.tok
echo; echo "=== only in $(basename "$2") ==="; comm -13 a.tok b.tok

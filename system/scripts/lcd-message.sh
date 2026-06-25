#!/bin/bash
# Write a static text message to the LCD framebuffer (/run/ctt/lcd), which the
# native ctt-lcd daemon renders onto the panel. Up to 4 lines, 20 columns each,
# left-aligned and space-padded/truncated to the panel width. For transient
# "system busy" screens (e.g. a station update) when the Node LCD interface is
# not driving the display.
#
# Framebuffer layout (matches ctt-lcd): 64 bytes = 8 CGRAM glyphs x 8 row-bytes
# (zeroed here — no custom glyphs), then 80 bytes = 4 rows x 20 cells of HD44780
# character codes (ASCII maps directly). Written atomically (temp + rename) so
# the daemon never renders a half-written frame.
#
# Usage: lcd-message.sh "line1" "line2" "line3" "line4"   (missing lines blank)

LCD=/run/ctt/lcd
[ -d /run/ctt ] || exit 0

tmp="$LCD.tmp.$$"
{
  head -c 64 /dev/zero                                   # 8 glyphs x 8 bytes, zeroed
  printf '%-20.20s%-20.20s%-20.20s%-20.20s' \
    "${1:-}" "${2:-}" "${3:-}" "${4:-}"                  # 4 rows x 20 cells (ASCII)
} > "$tmp" 2>/dev/null && mv -f "$tmp" "$LCD" 2>/dev/null

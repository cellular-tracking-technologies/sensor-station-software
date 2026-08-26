/* Host-side check that the C idGate() in ctt_radio_terra.ino agrees with the
 * gate recovered from ss_v4.0.0.hex. Reads 8- or 10-hex-char tag IDs on stdin,
 * one per line, and prints a verdict histogram. Build:
 *   cc -O2 -o /tmp/gate_test tools/gate_test.c
 * The two functions below are copied verbatim from the firmware. */
#include <stdio.h>
#include <stdint.h>
#include <string.h>

static const uint8_t TAG_ID_BYTES = 4, TAG_FRAME_BYTES = 5;
enum { GATE_PASS = 0, GATE_SHORT, GATE_ZERO, GATE_MSB, GATE_FF, GATE_PARITY };

static uint8_t idOctetSyndrome(uint8_t b) {
  uint8_t p0 = ((b >> 1) ^ (b >> 2) ^ (b >> 3) ^ (b >> 4)) & 1;
  uint8_t p1 = ((b >> 0) ^ (b >> 2) ^ (b >> 3) ^ (b >> 5)) & 1;
  uint8_t p2 = ((b >> 0) ^ (b >> 1) ^ (b >> 3) ^ (b >> 6)) & 1;
  return (uint8_t)(p0 | (p1 << 1) | (p2 << 2));
}

static uint8_t idGate(const uint8_t *frame, uint8_t len) {
  if (len < TAG_FRAME_BYTES) return GATE_SHORT;
  uint8_t zeros = 0, ones = 0, msb = 0, syndrome = 0;
  for (uint8_t i = 0; i < TAG_ID_BYTES; i++) {
    uint8_t b = frame[i];
    if (b == 0x00) zeros++;
    if (b == 0xFF) ones++;
    if (b & 0x80)  msb++;
    syndrome = (uint8_t)(syndrome + idOctetSyndrome(b));
  }
  if (zeros == TAG_ID_BYTES) return GATE_ZERO;
  if (msb >= 3)              return GATE_MSB;
  if (ones == TAG_ID_BYTES)  return GATE_FF;
  if (syndrome != 0)         return GATE_PARITY;
  return GATE_PASS;
}

int main(void) {
  static const char *name[] = {"pass","short","zero","msb","ff","parity"};
  unsigned long hist[6] = {0};
  char line[64];
  while (fgets(line, sizeof line, stdin)) {
    uint8_t f[5] = {0};
    if (sscanf(line, "%2hhx%2hhx%2hhx%2hhx", &f[0],&f[1],&f[2],&f[3]) != 4) continue;
    hist[idGate(f, 5)]++;
  }
  for (int i = 0; i < 6; i++) if (hist[i]) printf("%-7s %lu\n", name[i], hist[i]);
  return 0;
}

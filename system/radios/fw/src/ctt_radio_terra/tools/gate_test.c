/* Host-side check that the gate and corrector in ctt_radio_terra.ino agree with
 * what was recovered from ss_v4.0.0.hex, and a way to size their effect on a
 * corpus of real detections.
 *
 *   cc -O2 -o gate_test tools/gate_test.c
 *   cut -d, -f3 raw-data.csv | ./gate_test              # verdict histogram
 *   cut -d, -f3 raw-data.csv | ./gate_test -ecc         # + single-bit recovery
 *   ./gate_test -selftest                              # exhaustive proofs
 *
 * The two gate functions and the corrector are copied verbatim from the
 * firmware; keep them in sync. `-ecc` cannot evaluate the CRC test because a
 * station CSV never carries the 5th byte (beep-formatter.js strips it), so it
 * reports the unconditional single-octet result — the upper bound. */
#include <stdio.h>
#include <stdint.h>
#include <string.h>

static const uint8_t TAG_ID_BYTES = 4, TAG_FRAME_BYTES = 5;
enum { GATE_PASS = 0, GATE_SHORT, GATE_ZERO, GATE_MSB, GATE_FF, GATE_PARITY };
static const uint8_t ECC_SYNDROME_BIT[8] = { 0, 4, 5, 2, 6, 1, 0, 3 };

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

static uint8_t terraCrc8(const uint8_t *data, uint8_t len) {
  uint8_t crc = 0x00;
  for (uint8_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (uint8_t b = 0; b < 8; b++)
      crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
  }
  return crc;
}

static int idCorrectBit7(uint8_t *out, uint8_t crc_rx) {
  for (uint8_t i = 0; i < TAG_ID_BYTES; i++) {
    out[i] ^= 0x80;
    if (terraCrc8(out, TAG_ID_BYTES) == crc_rx) return 1;
    out[i] ^= 0x80;
  }
  return 0;
}

static uint8_t idCorrectOneOctet(uint8_t *out) {
  uint8_t fixed = 0;
  for (uint8_t i = 0; i < TAG_ID_BYTES; i++) {
    uint8_t s = idOctetSyndrome(out[i]);
    if (s == 0) continue;
    if (++fixed > 1) return 0xFF;
    out[i] = (uint8_t)(out[i] ^ (1 << ECC_SYNDROME_BIT[s]));
  }
  return fixed;
}

/* Proofs that do not need a corpus:
 *  - the accepted octet alphabet is exactly systematic Hamming(7,4) x free bit 7
 *  - every single-bit error in bits 0-6 of a codeword is corrected back exactly
 *  - Hamming(7,4) is perfect, so "correctable" alone means nothing */
static int selftest(void) {
  int legal = 0, correctable = 0, fail = 0;
  for (int b = 0; b < 256; b++) if (idOctetSyndrome((uint8_t)b) == 0) legal++;
  printf("legal octet values: %d/256 (expect 32)\n", legal);
  for (int b = 0; b < 256; b++) {
    uint8_t s = idOctetSyndrome((uint8_t)b);
    if (s == 0 || ECC_SYNDROME_BIT[s] || s == 6) correctable++;   /* s=6 -> bit 0 */
  }
  printf("octet values within one bit of a codeword: %d/256 (perfect code: 256)\n",
         correctable);
  for (int b = 0; b < 256; b++) {
    if (idOctetSyndrome((uint8_t)b) != 0) continue;
    for (int i = 0; i < 7; i++) {
      uint8_t f[4] = { (uint8_t)(b ^ (1 << i)), 0x07, 0x07, 0x07 };
      if (idCorrectOneOctet(f) != 1 || f[0] != (uint8_t)b) fail++;
    }
  }
  printf("single-bit corrections over 32 codewords x 7 bits: %d wrong (expect 0)\n", fail);
  /* Bit 7 is outside the parity code, so only the CRC can locate a bit-7 flip.
   * The search returns the first candidate that verifies; prove that cannot be
   * ambiguous. CRC-8 is linear, so a bit-7 flip at byte i xors the CRC by a
   * constant -- if those four constants are distinct, at most one candidate can
   * ever match. */
  printf("crc delta for a bit-7 flip at byte i:");
  uint8_t d[4];
  for (int i = 0; i < 4; i++) {
    uint8_t z[4] = {0,0,0,0}; z[i] = 0x80;
    d[i] = terraCrc8(z, 4); printf(" %02X", d[i]);
  }
  int dup = 0;
  for (int i = 0; i < 4; i++) for (int j = i+1; j < 4; j++) if (d[i] == d[j]) dup++;
  printf("   distinct: %s\n", dup ? "NO -- AMBIGUOUS" : "yes");
  fail += dup;

  int amb = 0;
  for (unsigned long v = 0; v < 200000UL; v++) {
    uint8_t id[4] = { (uint8_t)(v*7), (uint8_t)(v>>3), (uint8_t)(v>>11), (uint8_t)(v>>19) };
    uint8_t crc = terraCrc8(id, 4);
    int i = (int)(v & 3);
    uint8_t bad[4]; memcpy(bad, id, 4); bad[i] ^= 0x80;
    if (!idCorrectBit7(bad, crc) || memcmp(bad, id, 4) != 0) amb++;
  }
  printf("bit-7 recovery over 200000 ids: %d failures (expect 0)\n", amb);
  fail += amb;

  /* the shipped alphabet, for eyeballing against a datasheet or a tag label */
  printf("alphabet:");
  for (int b = 0; b < 256; b++) if (idOctetSyndrome((uint8_t)b) == 0) printf(" %02X", b);
  printf("\n");
  return fail != 0;
}

int main(int argc, char **argv) {
  int want_ecc = 0;
  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "-selftest")) return selftest();
    if (!strcmp(argv[i], "-ecc")) want_ecc = 1;
  }
  static const char *name[] = {"pass","short","zero","msb","ff","parity"};
  unsigned long hist[6] = {0}, one_octet = 0, multi = 0;
  char line[64];
  while (fgets(line, sizeof line, stdin)) {
    uint8_t f[5] = {0};
    if (sscanf(line, "%2hhx%2hhx%2hhx%2hhx", &f[0],&f[1],&f[2],&f[3]) != 4) continue;
    uint8_t v = idGate(f, 5);
    hist[v]++;
    if (want_ecc && v == GATE_PARITY)
      (idCorrectOneOctet(f) == 1) ? one_octet++ : multi++;
  }
  unsigned long tot = 0;
  for (int i = 0; i < 6; i++) tot += hist[i];
  for (int i = 0; i < 6; i++)
    if (hist[i]) printf("%-7s %8lu  %5.2f%%\n", name[i], hist[i], tot ? 100.0*hist[i]/tot : 0);
  if (want_ecc)
    printf("\nof the parity rejects: %lu recoverable by correcting ONE octet, "
           "%lu need two or more (noise)\n", one_octet, multi);
  return 0;
}

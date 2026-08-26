/*
 * ctt_radio_terra — 434 MHz FSK tag receiver for the Feather 32u4 radios,
 * carrying the three fixes terra-rfm69 has and ss_v4.0.0.hex does not.
 *
 * WHY THIS FILE EXISTS
 *
 * The shipped radio firmware (system/radios/fw/ss_v3.0.0.hex, ss_v4.0.0.hex) has
 * no source. It was added to this monorepo as a built image in May/June 2024
 * (9462349, 4dd1a94) with no upstream pointer, and it is not in this repo's
 * history, the GitHub org, or any Bitbucket repository that could be probed.
 * The three fixes below therefore could not be applied to it — so the register
 * configuration was recovered from the binary instead and is reproduced here.
 *
 * The PHY below is NOT a new design. Every register value marked "baseline" was
 * disassembled out of ss_v4.0.0.hex (preset block at 0x1368-0x1528) and matches
 * terra-rfm69's own config in firmware/terra-rfm69/main.c:75-107 — same bitrate,
 * deviation, bandwidth, modulation, preamble and sync words. The two codebases
 * share an author and, evidently, a PHY. Goal here is behavioural parity with
 * ss_v4.0.0 on the fsktag path, plus the three deltas, and nothing else.
 *
 * THE THREE FIXES
 *
 *  1. RegRssiThresh (0x29) is PROGRAMMED. No literal write to 0x29 exists
 *     anywhere in either shipped image, which leaves it at its 0xFF reset value.
 *     This is the same defect terra-rfm69 carried until 2026-08-12, where its
 *     setter was commented out and referenced a symbol that did not exist. Per
 *     terra's note, datasheet 3.5.3.1 makes -114 dBm the correct value for AGC
 *     operation, not a preference.
 *  2. SIGNAL-QUALITY INSTRUMENTATION. Idle noise floor, SNR, FEI, LNA gain and
 *     ISR-to-FIFO latency are measured and reported. terra exists to collect the
 *     FEI distribution — its RxBw comment says the tags run uncompensated
 *     crystals outdoors, so the frequency-error spread is unknown and must be
 *     assumed wide. None of this is observable through the shipped firmware.
 *  3. THE CRC BYTE IS FORWARDED. The 5th payload byte is a CRC-8 over the 4 id
 *     bytes. The shipped BEEP_0 record drops it; terra forwards it as crc/crcok.
 *     Reported here on the diagnostic line, with terra's exact polynomial.
 *
 * WIRE COMPATIBILITY — deliberately unchanged
 *
 * Detections are emitted as PROTOCOL_OUT_BEEP_0, byte-for-byte what
 * src/hardware/ctt/atmega32u4_receiver.js:36-50 already decodes: a hex-encoded
 * line of 00 + 4 id bytes + int8 RSSI. Nothing downstream of the socket needs to
 * change. The instrumentation rides on a SEPARATE JSON line, which parse_subghz
 * returns null for and RadioReceiver re-emits as 'raw' — visible in the journal
 * and to probe-radio-config.mjs --mode listen, invisible to the beep pipeline.
 *
 * PIN MAP — recovered from ss_v4.0.0.hex, not guessed
 *
 * IRQ = D7 (PE6). DIRECTLY READ: the image contains exactly one call to
 *   attachInterrupt, with r24 = 4 (call@0x162e). The AVR core's 32u4 branch
 *   maps case 4 to `EICRB |= mode; EIMSK |= (1<<INT6)`, INT6 is PE6, and
 *   digitalPinToInterrupt() yields 4 only for pin 7. The image's EIMSK sbi bits
 *   {0,1,2,3,6} are that switch's other cases, i.e. library code, not the pin.
 *
 * CS = D17 (PB0, the hardware SS). BY ELIMINATION, which is weaker than the
 *   above and should be treated as such: the image makes exactly 5 pinMode and
 *   3 digitalWrite calls, all enumerated. Four are SPI.begin()'s own boilerplate
 *   (digitalWrite(SS,HIGH)@0x0e64, pinMode(SS)@0x0e6c, pinMode(SCK=15)@0x0e80,
 *   pinMode(MOSI=16)@0x0e88); the remaining two, pins 13 and 12, are driven
 *   together (digitalWrite(13,1)@0x2dc0 with sbi PORTD.6, and 13,0 with cbi) so
 *   they are an LED pair. No DDR register is touched outside pinMode. Since CS
 *   must be an output and no other pin is ever made one, CS is SS. The per-
 *   transaction toggle is not visible as an opcode because it goes through a
 *   cached port pointer rather than digitalWrite.
 *
 * RST = NOT DRIVEN. No pin remains, and the image contains no reset sequence.
 *   The module's RESET is handled in hardware on this board. PIN_RFM69_RST is
 *   therefore -1 and radioReset() is a no-op; set it to a pin number only if a
 *   schematic says otherwise.
 *
 * Confirm against the board schematic before a production flash. The cheap
 * bench check is step 4 of README "Before flashing": a wrong CS makes
 * RegSyncValue1 read back as something other than 0xD3 and this firmware says
 * so on the serial line immediately.
 */

#include <SPI.h>

/* CS = D17 was WRONG. terra.1/terra.2 ran with it and every register read back
 * 0xFF (MISO idling high) — the bus never reached the radio. The elimination
 * argument that produced D17 assumed no pin could be made an output without a
 * pinMode call, but pointer-based DDR writes are invisible to opcode scanning,
 * so that assumption was unfounded.
 * Now using Adafruit's reference wiring for the Feather 32u4 RFM69. IRQ = 7 is
 * independently verified from the binary and it agrees with that reference,
 * which is the reason to trust the other two. STILL TO CONFIRM: run `status` and
 * check the registers read back what was written, NOT 0xFF. */
static const uint8_t PIN_RFM69_CS  = 8;   /* Adafruit reference — verify via `status` */
static const uint8_t PIN_RFM69_IRQ = 7;   /* D7 / PE6 / INT6 — verified from ss_v4.0.0.hex */
static const int8_t  PIN_RFM69_RST = 4;   /* Adafruit reference */

static const char FIRMWARE_VERSION[] = "4.0.0-terra.10";

/* RFM69 / SX1231 register addresses (only the ones this firmware touches). */
enum {
  REG_OPMODE        = 0x01, REG_DATAMODUL     = 0x02,
  REG_BITRATE_MSB   = 0x03, REG_BITRATE_LSB   = 0x04,
  REG_FDEV_MSB      = 0x05, REG_FDEV_LSB      = 0x06,
  REG_FRF_MSB       = 0x07, REG_FRF_MID       = 0x08, REG_FRF_LSB = 0x09,
  REG_PA_LEVEL      = 0x11, REG_LNA           = 0x18,
  REG_RXBW          = 0x19, REG_AFCBW         = 0x1A,
  REG_FEI_MSB       = 0x21, REG_FEI_LSB       = 0x22,
  REG_RSSI_CONFIG   = 0x23, REG_RSSI_VALUE    = 0x24,
  REG_DIO_MAPPING1  = 0x25, REG_IRQ_FLAGS1    = 0x27, REG_IRQ_FLAGS2 = 0x28,
  REG_RSSI_THRESH   = 0x29,
  REG_PREAMBLE_MSB  = 0x2C, REG_PREAMBLE_LSB  = 0x2D,
  REG_SYNC_CONFIG   = 0x2E, REG_SYNC_VALUE1   = 0x2F, REG_SYNC_VALUE2 = 0x30,
  REG_SYNC_VALUE3   = 0x31, REG_SYNC_VALUE4   = 0x32,
  REG_PACKET_CFG1   = 0x37, REG_PAYLOAD_LEN   = 0x38,
  REG_FIFO_THRESH   = 0x3C, REG_PACKET_CFG2   = 0x3D,
  REG_AFC_FEI       = 0x1E,
  REG_FIFO          = 0x00, REG_TEST_DAGC     = 0x6F,
};

enum { OPMODE_STANDBY = 0x04, OPMODE_RX = 0x10 };
enum { IRQ1_MODEREADY = 0x80, IRQ1_RSSI = 0x08, IRQ1_SYNCMATCH = 0x01,
       IRQ2_PAYLOADREADY = 0x04 };
/* RegAfcFei (0x1E): bit6 FeiDone, bit5 FeiStart (write-only, always reads 0). */
enum { FEI_DONE = 0x40, FEI_START = 0x20 };
/* RegRssiConfig (0x23): bit1 RssiDone, bit0 RssiStart (write-only). */
enum { RSSI_DONE = 0x02, RSSI_START = 0x01 };

/* Tag frame: 4 id bytes + 1 CRC byte. Matches terra's payload_length = 5. */
static const uint8_t TAG_ID_BYTES = 4;
static const uint8_t TAG_FRAME_BYTES = 5;

/* --------------------------------------------------------------------------
 * SPI register access. Single-threaded by construction: the ISR never touches
 * SPI, it only stamps a flag. terra needs rfm69_spi_lock because it has four
 * threads; here the main loop owns the bus outright, so there is no lock and no
 * window in which one can be forgotten.
 * -------------------------------------------------------------------------- */
static void regWrite(uint8_t reg, uint8_t val) {
  SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
  digitalWrite(PIN_RFM69_CS, LOW);
  SPI.transfer(reg | 0x80);           /* MSB set = write */
  SPI.transfer(val);
  digitalWrite(PIN_RFM69_CS, HIGH);
  SPI.endTransaction();
}

static uint8_t regRead(uint8_t reg) {
  SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
  digitalWrite(PIN_RFM69_CS, LOW);
  SPI.transfer(reg & 0x7F);
  uint8_t v = SPI.transfer(0x00);
  digitalWrite(PIN_RFM69_CS, HIGH);
  SPI.endTransaction();
  return v;
}

static void setMode(uint8_t mode) {
  regWrite(REG_OPMODE, (regRead(REG_OPMODE) & 0xE3) | mode);
  /* ModeReady handshake — bounded so a dead radio cannot wedge the loop. */
  uint32_t deadline = millis() + 1000;
  while (!(regRead(REG_IRQ_FLAGS1) & IRQ1_MODEREADY) && millis() < deadline) { }
}

/* --------------------------------------------------------------------------
 * FIX 3: terra's tag CRC-8. Same polynomial and seed as
 * firmware/terra-rfm69/terra_crc8.c, so a frame judged good here is judged good
 * there. Kept byte-identical in behaviour on purpose: divergence between the two
 * would be indistinguishable from a radio problem in the field.
 * -------------------------------------------------------------------------- */
static uint8_t terraCrc8(const uint8_t *data, uint8_t len) {
  uint8_t crc = 0x00;
  for (uint8_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (uint8_t b = 0; b < 8; b++)
      crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
  }
  return crc;
}

/* --------------------------------------------------------------------------
 * Runtime config. The keys mirror the shipped firmware's command surface, which
 * was discovered by probing a live radio (probe-radio-config.mjs): rxbw,
 * modulation, rx_type, rx_size, tx_dbm, preset, version all answer. rssi_thresh
 * is NEW — the fix is worth nothing if it cannot be dialled and proven.
 * -------------------------------------------------------------------------- */
/* The baseline values, as named literals. These are what radioConfigure() writes,
 * unconditionally and as compile-time constants, so that regpairs.py can extract
 * this firmware's register table straight out of the .hex and diff it against
 * regmap-baseline.md. A value that reaches the radio only via a RAM variable is
 * invisible to that check — which is exactly how a silent PHY drift would get in.
 * Runtime overrides are applied AFTER the literal block, by applyOverrides(). */
enum {
  BASE_DATAMODUL    = 0x00,   /* FSK, no shaping, packet mode */
  BASE_RXBW         = 0xEB,   /* Mant 20, Exp 3 -> 50 kHz */
  BASE_PAYLOAD_LEN  = TAG_FRAME_BYTES,  /* terra: 5. Shipped v3 wrote 0x40. */
  BASE_RSSI_THRESH  = 0xE4,   /* FIX 1: -114 dBm in -0.5 dBm steps. Never written by
                               * either shipped image, so it sat at 0xFF. */
  /* SyncOn | SyncSize=2 bytes ((n-1)<<3) | SyncTol=0. DERIVED, not disassembled:
   * the shipped image computes 0x2E at runtime. The ID match is the evidence it
   * is right — our decoded IDs equal stock's, and a different sync length would
   * shift the payload and change every ID. */
  BASE_SYNC_CONFIG  = 0x88,
};

struct Config {
  int8_t  snr_min_db;    /* suppress BEEP records below this SNR. 0 = off.
                          * The sync word cannot discriminate any further: at
                          * sync_tol 0 / size 2 we are already at maximum radio
                          * selectivity, and the sweep showed phantoms sit at
                          * 0.5-3 dB SNR while real tags run 9-28 dB. So the
                          * remaining filter has to be applied in firmware, which
                          * is presumably what the shipped image does — it logs
                          * 21 tags where we log 1344. */
  uint8_t sync_config;   /* RegSyncConfig raw: SyncOn|SyncSize|SyncTol */
  bool    crc_gate;      /* OFF by default: suppress unverifiable frames entirely.
                          * Normally unwanted — BEEP_0/Validated=0 already says
                          * "not verified" without losing the detection. */
  uint8_t rxbw;
  uint8_t rx_size;
  uint8_t modulation;
  int8_t  rssi_thresh_dbm;
};
static Config cfg = { 0, BASE_SYNC_CONFIG, false, BASE_RXBW, BASE_PAYLOAD_LEN, BASE_DATAMODUL, -114 };

static uint8_t rssiThreshReg(int8_t dbm) { return (uint8_t)(-2 * (int16_t)dbm); }

/* ISR -> loop handoff. Volatile, minimal, no SPI: an AVR ISR that touched the
 * bus would race the main loop's transaction. */
static volatile bool     payload_flag = false;
static volatile uint32_t payload_us   = 0;
static volatile uint32_t irq_count    = 0;   /* diagnostic: did DIO0 ever fire? */

static void onPayloadReady() {
  payload_us = micros();
  payload_flag = true;
  irq_count++;
}

/* Idle noise floor, in RegRssiValue units (-0.5 dBm/count), as an EWMA. Kept in
 * integer half-dBm: a float here would cost flash and cycles for no precision
 * that survives the 0.5 dB quantisation anyway. */
/* Set once at init by verifying a register readback. terra.2 had no such gate:
 * with SPI dead, RegIrqFlags2 read 0xFF, the PayloadReady bit was set in that
 * 0xFF, and the polled path emitted 18k fake FFFFFFFF detections into the
 * station's data file. A receiver that cannot talk to its radio must be silent,
 * not prolific. */
static bool radio_ok = false;

/* Emitted vs rejected BEEP_0 records. Surfaced by `status` so the CRC gate's
 * effect is measurable rather than asserted. */
static uint32_t emitted = 0, rejected = 0, snr_rejected = 0;

/* FEI, measured the way the datasheet requires. 3.4.14: "The operation must be
 * done during the reception of preamble", and an evaluation takes 4 bit periods
 * (160 us at 25 kbps, against a 2-byte/640 us preamble). terra.1-.3 read
 * RegFei after PayloadReady — long after the preamble had gone — which is why
 * every reading was 0. The trigger is RegIrqFlags1.Rssi, which asserts as soon
 * as the signal passes RegRssiThresh, i.e. early in the preamble. That flag is
 * only meaningful because FIX 1 programs the threshold at all. */
static int16_t fei_raw   = 0;
static bool    fei_valid = false;   /* per-packet; "not measured" is not zero */
static uint32_t fei_attempts = 0, fei_ok = 0;

/* Signal RSSI, captured in the same preamble window. Datasheet 3.4.9 imposes the
 * same rule as FEI: "The RSSI sampling must occur during the reception of
 * preamble in FSK", and RssiValue is only readable while it exceeds
 * RssiThreshold. terra.1-.5 read RegRssiValue AFTER PayloadReady instead, so a
 * strong signal read roughly right while a weak one had already decayed to the
 * noise floor — every unvalidated tag on ch1 reported ~-85 dBm (the noise floor)
 * against stock's -60..-79 for the same events, an 8-24 dB error. */
static int16_t rssi_sig_half = 0;
static bool    rssi_sig_valid = false;
static uint32_t rssi_ok = 0;

/* Both measurements are taken at SYNC MATCH, not during preamble and not after
 * the packet.
 *
 * Why not RegIrqFlags1.Rssi (what terra.6/.7 used): the datasheet's bit table
 * says that flag is "Set in Rx when the RssiValue exceeds RssiThreshold" and
 * "Cleared when leaving Rx". We never leave Rx, so on every channel here it
 * latches once and stays set forever — RegIrqFlags1 read 0xD8 on all five. It is
 * a one-way latch, not a signal-present indicator, so the capture ran on idle
 * noise and reported the noise floor as the signal.
 *
 * SyncAddressMatch (bit 0) is "Set when Sync and Address (if enabled) are
 * detected" and "Cleared when leaving Rx or FIFO is emptied" — and we empty the
 * FIFO on every packet, so it self-clears per frame. It is a true per-frame
 * edge, and it fires with ~1.6 ms of payload still to come at 25 kbps/5 bytes,
 * which is far more slack than the 640 us preamble. This is also where
 * terra-rfm69 samples: its DIO3 interrupt is SyncAddress.
 *
 * RegRssiValue needs no trigger. Sampled 12 times per channel it tracked each
 * channel's own noise floor and moved 5-8 dB between reads, i.e. it is live.
 * RssiStart/RssiDone are not used: RegRssiConfig reads 0x00 forever on this part,
 * so terra.6 waited on a bit that never sets and burned 1 ms per frame doing it.
 * FEI still needs its FeiStart trigger and 4 bit periods, so it gets a short
 * fixed delay rather than a poll. */
static void captureAtSyncMatch() {
  if (rssi_sig_valid && fei_valid) return;           /* already captured this frame */
  if (!(regRead(REG_IRQ_FLAGS1) & IRQ1_SYNCMATCH)) return;

  if (!rssi_sig_valid) {
    rssi_sig_half = -(int16_t)regRead(REG_RSSI_VALUE);
    rssi_sig_valid = true;
    rssi_ok++;
  }
  if (!fei_valid) {
    fei_attempts++;
    regWrite(REG_AFC_FEI, FEI_START);
    delayMicroseconds(200);                          /* 4 bit periods = 160 us at 25 kbps */
    fei_raw = (int16_t)(((uint16_t)regRead(REG_FEI_MSB) << 8) | regRead(REG_FEI_LSB));
    fei_valid = true;
    fei_ok++;
  }
}

static int16_t noise_floor_half_dbm = 0;
static bool    noise_valid = false;
static uint32_t next_noise_sample_ms = 0;

static int16_t readRssiHalfDbm() {
  regWrite(REG_RSSI_CONFIG, 0x01);                 /* RssiStart */
  uint32_t deadline = micros() + 2000;
  while (!(regRead(REG_RSSI_CONFIG) & 0x02) && (int32_t)(micros() - deadline) < 0) { }
  return -(int16_t)regRead(REG_RSSI_VALUE);        /* value is 2x -dBm */
}

static void sampleNoiseFloor() {
  int16_t s = readRssiHalfDbm();
  if (!noise_valid) { noise_floor_half_dbm = s; noise_valid = true; return; }
  /* EWMA, alpha = 1/8, integer: floor += (s - floor) / 8 */
  noise_floor_half_dbm += (s - noise_floor_half_dbm) >> 3;
}

/* --------------------------------------------------------------------------
 * The PHY. Every "baseline" value below was read out of ss_v4.0.0.hex; see
 * scratchpad/regmap-baseline.md for the extraction. Do not "improve" these
 * numbers here — a divergence from the shipped image is a change in what the
 * fleet hears, and belongs in its own change with its own field evidence.
 * -------------------------------------------------------------------------- */
static void radioConfigure() {
  regWrite(REG_TEST_DAGC,    0x30);        /* baseline */
  regWrite(REG_DATAMODUL,    BASE_DATAMODUL);  /* baseline 0x00: FSK, no shaping, packet */
  regWrite(REG_BITRATE_MSB,  0x05);        /* baseline: 0x0500 = 1280 -> 25 kbps */
  regWrite(REG_BITRATE_LSB,  0x00);
  regWrite(REG_FDEV_MSB,     0x01);        /* baseline: 0x0199 = 409 -> 24.96 kHz */
  regWrite(REG_FDEV_LSB,     0x99);
  regWrite(REG_FRF_MSB,      0x6C);        /* 434.000 MHz: 434e6 / (32e6/2^19) = 0x6C8000 */
  regWrite(REG_FRF_MID,      0x80);        /* the shipped image computes Frf at runtime; */
  regWrite(REG_FRF_LSB,      0x00);        /* terra hardcodes 434.0, so we do too */
  regWrite(REG_RXBW,         BASE_RXBW);   /* baseline 0xEB -> 50 kHz */
  regWrite(REG_AFCBW,        0xEB);        /* baseline */
  regWrite(REG_PACKET_CFG1,  0x00);        /* baseline: fixed length, hardware CRC off */
  regWrite(REG_PACKET_CFG2,  0x00);        /* baseline */
  regWrite(REG_PAYLOAD_LEN,  BASE_PAYLOAD_LEN);
  regWrite(REG_PREAMBLE_MSB, 0x00);        /* baseline: 2 bytes */
  regWrite(REG_PREAMBLE_LSB, 0x02);
  /* SyncConfig: SyncOn | SyncSize(2 bytes) -> 0x80 | (1 << 3) = 0x88, tolerance 0.
   * DERIVED, not disassembled: the shipped image writes 0x2E from a computed
   * value because sync length varies per preset. 2 sync bytes is terra's
   * sync_count, and the sync VALUES below are disassembled. */
  regWrite(REG_SYNC_CONFIG,  BASE_SYNC_CONFIG);
  regWrite(REG_SYNC_VALUE1,  0xD3);        /* baseline, == terra sync_words[0] */
  regWrite(REG_SYNC_VALUE2,  0x91);        /* baseline, == terra sync_words[1] */
  regWrite(REG_PA_LEVEL,     0x5F);        /* baseline (RX-only firmware, kept for parity) */
  regWrite(REG_FIFO_THRESH,  0x8F);        /* baseline */
  regWrite(REG_DIO_MAPPING1, 0x42);        /* baseline: DIO0 = PayloadReady in RX */

  /* FIX 1: the register the shipped firmware never writes. RegRssiThresh is in
   * -0.5 dBm steps, so -114 dBm -> 228 (0xE4). Left unwritten it sits at 0xFF.
   * Written as a literal so `regpairs.py` proves it is here. */
  regWrite(REG_RSSI_THRESH, BASE_RSSI_THRESH);
}

/* Anything the station has changed at runtime, re-applied over the literal
 * baseline. No-ops at boot, because cfg is initialised to the baseline. */
static void applyOverrides() {
  if (cfg.modulation != BASE_DATAMODUL)   regWrite(REG_DATAMODUL,   cfg.modulation);
  if (cfg.rxbw       != BASE_RXBW)        regWrite(REG_RXBW,        cfg.rxbw);
  if (cfg.sync_config != BASE_SYNC_CONFIG) regWrite(REG_SYNC_CONFIG, cfg.sync_config);
  if (cfg.rx_size    != BASE_PAYLOAD_LEN) regWrite(REG_PAYLOAD_LEN, cfg.rx_size);
  if (rssiThreshReg(cfg.rssi_thresh_dbm) != BASE_RSSI_THRESH)
    regWrite(REG_RSSI_THRESH, rssiThreshReg(cfg.rssi_thresh_dbm));
}

/* No-op when RESET is not wired to the MCU, which is what the shipped image
 * implies (it contains no reset sequence at all). Kept as a function so a board
 * that does wire it only needs PIN_RFM69_RST set. */
static void radioReset() {
  if (PIN_RFM69_RST < 0) return;
  pinMode((uint8_t)PIN_RFM69_RST, OUTPUT);
  digitalWrite((uint8_t)PIN_RFM69_RST, HIGH);   /* reset is active HIGH on this part */
  delay(10);
  digitalWrite((uint8_t)PIN_RFM69_RST, LOW);
  delay(10);
}

/* --------------------------------------------------------------------------
 * Output. Two lines per detection, in this order:
 *   1. the BEEP_0 hex record — what the station pipeline consumes
 *   2. the diagnostic JSON — what this firmware adds
 * BEEP_0 goes FIRST for the same reason terra emits TERRAUHF1 first: a consumer
 * reading a bounded buffer must get the record it depends on before the extra.
 * -------------------------------------------------------------------------- */
/* The station reads the CRC verdict from the RECORD TYPE, not from a flag:
 * beep-formatter.js:50-54 sets Validated=1 iff the tag id is 10 hex chars, i.e.
 * a BEEP_1 carrying 4 id bytes + the CRC byte, and then strips the CRC. BEEP_0
 * (4 id bytes) means "not validated". Stock marks ~89% of its strong-tag
 * detections validated this way.
 *
 * terra.1-.4 emitted BEEP_0 unconditionally, so every detection landed as
 * Validated=0 even when this firmware had just verified the CRC itself — the
 * check was performed and then discarded instead of being encoded where the
 * pipeline looks. Worse, terra.4's crc_gate DROPPED the frames it could not
 * verify, when the pipeline's own answer is to label them. */
static void emitBeep0(const uint8_t *id, int8_t rssi_dbm) {
  char line[16];
  snprintf(line, sizeof(line), "00%02X%02X%02X%02X%02X",
           id[0], id[1], id[2], id[3], (uint8_t)rssi_dbm);
  Serial.println(line);
}

/* PROTOCOL_OUT_BEEP_1: opcode 01, 5-byte id (4 id + CRC), int8 rssi — 7 bytes,
 * exactly what atmega32u4_receiver.js:57-70 decodes. */
static void emitBeep1(const uint8_t *id, uint8_t crc, int8_t rssi_dbm) {
  char line[16];
  snprintf(line, sizeof(line), "01%02X%02X%02X%02X%02X%02X",
           id[0], id[1], id[2], id[3], crc, (uint8_t)rssi_dbm);
  Serial.println(line);
}

static void emitDiagnostic(const uint8_t *frame, int16_t rssi_half,
                           bool have_fei, int16_t fei, uint8_t lna, uint32_t isr_us,
                           bool crc_checkable, bool crcok, bool rssi_preamble) {
  /* Half-dBm integers are printed as d.d by hand — no float formatting, which
   * would pull vfprintf's float support into a 32u4 flash budget. */
  int16_t r10 = rssi_half * 5;                       /* half-dBm -> tenths of dBm */
  Serial.print(F("{\"meta\":{\"data_type\":\"terra_uhf\",\"rssi\":"));
  Serial.print(r10 / 10); Serial.print('.'); Serial.print(abs(r10 % 10));
  if (noise_valid) {
    int16_t n10 = noise_floor_half_dbm * 5;
    Serial.print(F(",\"noise\":"));
    Serial.print(n10 / 10); Serial.print('.'); Serial.print(abs(n10 % 10));
    int16_t s10 = r10 - n10;                         /* SNR = rssi - noise floor */
    Serial.print(F(",\"snr\":"));
    Serial.print(s10 / 10); Serial.print('.'); Serial.print(abs(s10 % 10));
  }
  /* FEI in Fstep units (61.035 Hz), raw and in Hz: raw is what a datasheet check
   * needs, Hz is what the field question needs. Omitted entirely when the
   * preamble window was missed — "not measured" must not read as "zero error",
   * which is the same rule terra applies to its CRC keys. */
  if (have_fei) {
    Serial.print(F(",\"fei_raw\":")); Serial.print(fei);
    Serial.print(F(",\"fei_hz\":"));  Serial.print((int32_t)fei * 61);
  }
  Serial.print(F(",\"rssi_src\":\""));
  Serial.print(rssi_preamble ? F("sync") : F("late"));
  Serial.print(F("\",\"lna\":"));   Serial.print(lna & 0x07);
  Serial.print(F(",\"isr_us\":"));  Serial.print(isr_us);
  if (crc_checkable) {
    /* FIX 3: the 5th byte, and the verdict on it. Omitted entirely when the byte
     * did not arrive — "not reported" is not the same as "checked and failed". */
    Serial.print(F(",\"crc\":"));   Serial.print(frame[TAG_ID_BYTES]);
    Serial.print(F(",\"crcok\":")); Serial.print(crcok ? 1 : 0);
  }
  Serial.print(F("},\"data\":{\"id\":\""));
  for (uint8_t i = 0; i < TAG_ID_BYTES; i++) {
    if (frame[i] < 0x10) Serial.print('0');
    Serial.print(frame[i], HEX);
  }
  Serial.println(F("\"}}"));
}

static void reply(const char *key, bool ok, const char *err) {
  Serial.print(F("{\"key\":\"")); Serial.print(key);
  Serial.print(F("\",\"res\":")); Serial.print(ok ? F("true") : F("false"));
  if (!ok && err) { Serial.print(F(",\"err\":\"")); Serial.print(err); Serial.print('"'); }
  Serial.println('}');
}

/* --------------------------------------------------------------------------
 * Command handling. Grammar is key:value terminated by newline, and the reply
 * shape is {"key":..,"res":..[,"err":..]} — both copied from the shipped
 * firmware so the station's existing config strings keep working unchanged.
 * -------------------------------------------------------------------------- */
static void handleCommand(char *cmd) {
  char *colon = strchr(cmd, ':');
  char *arg = NULL;
  if (colon) { *colon = '\0'; arg = colon + 1; }

  if (!strcmp(cmd, "status")) { printStatus(); return; }
  if (!strcmp(cmd, "version")) {
    Serial.print(F("{\"name\":\"SensorStationRadio\",\"firmware\":\""));
    Serial.print(FIRMWARE_VERSION);
    Serial.println(F("\"}"));
    return;
  }
  if (!arg || !*arg) { reply(cmd, false, "bad arg"); return; }

  if (!strcmp(cmd, "preset")) {
    if (!strcmp(arg, "fsktag")) { setMode(OPMODE_STANDBY); radioConfigure(); applyOverrides(); setMode(OPMODE_RX); reply(cmd, true, NULL); }
    else reply(cmd, false, "unsupported preset");   /* RX-only build: no node3/ook */
    return;
  }
  if (!strcmp(cmd, "rxbw")) {
    cfg.rxbw = (uint8_t)strtol(arg, NULL, 0);
    regWrite(REG_RXBW, cfg.rxbw); reply(cmd, true, NULL); return;
  }
  if (!strcmp(cmd, "rx_size")) {
    long n = strtol(arg, NULL, 10);
    if (n < 1 || n > 64) { reply(cmd, false, "range"); return; }
    cfg.rx_size = (uint8_t)n;
    regWrite(REG_PAYLOAD_LEN, cfg.rx_size); reply(cmd, true, NULL); return;
  }
  if (!strcmp(cmd, "modulation")) {
    if (!strcmp(arg, "fsk")) cfg.modulation = 0x00;
    else if (!strcmp(arg, "ook")) cfg.modulation = 0x08;
    else { reply(cmd, false, "bad arg"); return; }
    regWrite(REG_DATAMODUL, cfg.modulation); reply(cmd, true, NULL); return;
  }
  /* NEW: makes fix 1 observable and tunable from the station, which is the only
   * way to demonstrate what the 0xFF reset value was costing. */
  if (!strcmp(cmd, "rssi_thresh")) {
    long dbm = strtol(arg, NULL, 10);
    if (dbm > -20 || dbm < -127) { reply(cmd, false, "range"); return; }
    cfg.rssi_thresh_dbm = (int8_t)dbm;
    regWrite(REG_RSSI_THRESH, rssiThreshReg(cfg.rssi_thresh_dbm));
    reply(cmd, true, NULL); return;
  }
  /* sync_size:<1..8> — SyncSize is bits 5:3 of RegSyncConfig, encoded as n-1.
   * NOTE: raising it beyond 2 also requires the extra bytes to be programmed via
   * sync_val, because RegSyncValue3/4 reset to 0x00 and the byte the tag actually
   * sends after D3 91 is the first ID byte, which differs per tag. Expect zero
   * detections at size 3+ until sync_val says otherwise — that is the point of
   * having both commands. */
  if (!strcmp(cmd, "snr_min")) {
    long n = strtol(arg, NULL, 10);
    if (n < 0 || n > 40) { reply(cmd, false, "range 0-40"); return; }
    cfg.snr_min_db = (int8_t)n; reply(cmd, true, NULL); return;
  }
  if (!strcmp(cmd, "sync_size")) {
    long n = strtol(arg, NULL, 10);
    if (n < 1 || n > 8) { reply(cmd, false, "range 1-8"); return; }
    cfg.sync_config = (uint8_t)((cfg.sync_config & ~0x38) | (((uint8_t)n - 1) << 3));
    regWrite(REG_SYNC_CONFIG, cfg.sync_config); reply(cmd, true, NULL); return;
  }
  /* sync_tol:<0..7> — bit errors tolerated in the sync word (bits 2:0). Raising
   * it makes the receiver LESS selective; lowering it cannot go below 0, which is
   * where the baseline already sits. */
  if (!strcmp(cmd, "sync_tol")) {
    long n = strtol(arg, NULL, 10);
    if (n < 0 || n > 7) { reply(cmd, false, "range 0-7"); return; }
    cfg.sync_config = (uint8_t)((cfg.sync_config & ~0x07) | (uint8_t)n);
    regWrite(REG_SYNC_CONFIG, cfg.sync_config); reply(cmd, true, NULL); return;
  }
  /* sync_val:<1..4>:<hex> — programs RegSyncValue1..4 so a longer sync word can
   * actually be tried. */
  if (!strcmp(cmd, "sync_val")) {
    char *colon2 = strchr(arg, ':');
    if (!colon2) { reply(cmd, false, "want idx:hex"); return; }
    *colon2 = '\0';
    long idx = strtol(arg, NULL, 10);
    long v   = strtol(colon2 + 1, NULL, 16);
    if (idx < 1 || idx > 4 || v < 0 || v > 255) { reply(cmd, false, "range"); return; }
    regWrite((uint8_t)(REG_SYNC_VALUE1 + idx - 1), (uint8_t)v);
    reply(cmd, true, NULL); return;
  }
  if (!strcmp(cmd, "crc_gate")) {
    if (!strcmp(arg, "on"))       cfg.crc_gate = true;
    else if (!strcmp(arg, "off")) cfg.crc_gate = false;
    else { reply(cmd, false, "want on|off"); return; }
    reply(cmd, true, NULL); return;
  }
  if (!strcmp(cmd, "regread")) {
    uint8_t r = (uint8_t)strtol(arg, NULL, 16);
    Serial.print(F("{\"key\":\"regread\",\"res\":true,\"reg\":\""));
    if (r < 0x10) Serial.print('0');
    Serial.print(r, HEX);
    Serial.print(F("\",\"val\":\""));
    uint8_t v = regRead(r);
    if (v < 0x10) Serial.print('0');
    Serial.print(v, HEX);
    Serial.println(F("\"}"));
    return;
  }
  reply(cmd, false, "unknown key");
}

/* One line summarising whether the radio is in RX, whether DIO0 has ever fired,
 * and what the live registers hold. This is the difference between "the
 * interrupt is not wired where we think" and "the radio is not receiving". */
static void printStatus() {
  Serial.print(F("{\"key\":\"status\",\"res\":true,\"opmode\":\""));
  Serial.print(regRead(REG_OPMODE), HEX);
  Serial.print(F("\",\"irqflags1\":\""));  Serial.print(regRead(REG_IRQ_FLAGS1), HEX);
  Serial.print(F("\",\"irqflags2\":\""));  Serial.print(regRead(REG_IRQ_FLAGS2), HEX);
  Serial.print(F("\",\"rssi_raw\":"));      Serial.print(regRead(REG_RSSI_VALUE));
  Serial.print(F(",\"rssi_thresh\":\""));   Serial.print(regRead(REG_RSSI_THRESH), HEX);
  Serial.print(F("\",\"payload_len\":"));   Serial.print(regRead(REG_PAYLOAD_LEN));
  Serial.print(F(",\"sync1\":\""));         Serial.print(regRead(REG_SYNC_VALUE1), HEX);
  Serial.print(F("\",\"sync2\":\""));      Serial.print(regRead(REG_SYNC_VALUE2), HEX);
  Serial.print(F("\",\"syncconf\":\""));   Serial.print(regRead(REG_SYNC_CONFIG), HEX);
  Serial.print(F("\",\"sync_size\":"));     Serial.print(((regRead(REG_SYNC_CONFIG) >> 3) & 0x07) + 1);
  Serial.print(F(",\"sync_tol\":"));         Serial.print(regRead(REG_SYNC_CONFIG) & 0x07);
  Serial.print(F(",\"dio1\":\""));          Serial.print(regRead(REG_DIO_MAPPING1), HEX);
  Serial.print(F("\",\"radio_ok\":"));      Serial.print(radio_ok ? 1 : 0);
  Serial.print(F(",\"crc_gate\":"));         Serial.print(cfg.crc_gate ? 1 : 0);
  Serial.print(F(",\"emitted\":"));          Serial.print(emitted);
  Serial.print(F(",\"rejected\":"));         Serial.print(rejected);
  Serial.print(F(",\"snr_min\":"));          Serial.print(cfg.snr_min_db);
  Serial.print(F(",\"snr_rejected\":"));     Serial.print(snr_rejected);
  Serial.print(F(",\"fei_attempts\":"));     Serial.print(fei_attempts);
  Serial.print(F(",\"fei_ok\":"));           Serial.print(fei_ok);
  Serial.print(F(",\"rssi_ok\":"));          Serial.print(rssi_ok);
  Serial.print(F(",\"irq_count\":"));        Serial.print(irq_count);
  Serial.print(F(",\"dio0_level\":"));       Serial.print(digitalRead(PIN_RFM69_IRQ));
  Serial.println('}');
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RFM69_CS, OUTPUT);
  digitalWrite(PIN_RFM69_CS, HIGH);
  pinMode(PIN_RFM69_IRQ, INPUT);
  SPI.begin();

  radioReset();
  /* Prove the part is alive before claiming to be a receiver: RegSyncValue1 is
   * readable and we know what we just wrote to it. */
  setMode(OPMODE_STANDBY);
  radioConfigure();
  applyOverrides();
  /* Readback proves the SPI path: we know what was just written to 0x2F. */
  radio_ok = (regRead(REG_SYNC_VALUE1) == 0xD3) && (regRead(REG_OPMODE) != 0xFF);
  if (!radio_ok) {
    Serial.println(F("{\"error\":\"Radio Init Failed\"}"));   /* same string the shipped image emits */
  }
  attachInterrupt(digitalPinToInterrupt(PIN_RFM69_IRQ), onPayloadReady, RISING);
  setMode(OPMODE_RX);
}

void loop() {
  /* 1. Commands. */
  static char buf[48];
  static uint8_t n = 0;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') { buf[n] = '\0'; if (n) handleCommand(buf); n = 0; continue; }
    if (n < sizeof(buf) - 1) buf[n++] = c;
  }

  /* 2. Detections. Either the DIO0 edge fired, or RegIrqFlags2 says a payload is
   *    waiting. Polling is the load-bearing path; the edge only sharpens isr_us.
   *    Relying on the edge alone is what made terra.1 deaf. */
  /* Capture at sync match, before anything slower in the loop: the payload is
   * still arriving, so the signal is present and RegRssiValue reflects it. */
  if (radio_ok) captureAtSyncMatch();

  uint8_t irq2 = radio_ok ? regRead(REG_IRQ_FLAGS2) : 0x00;
  /* 0xFF is not a status byte, it is a dead bus: every bit set means MISO idled
   * high. Refuse it explicitly rather than trusting the PayloadReady bit in it. */
  bool ready_polled = radio_ok && irq2 != 0xFF && (irq2 & IRQ2_PAYLOADREADY) != 0;
  if (radio_ok && (payload_flag || ready_polled)) {
    noInterrupts();
    uint32_t t_isr = payload_flag ? payload_us : micros();
    payload_flag = false;
    interrupts();

    uint8_t frame[TAG_FRAME_BYTES] = { 0 };
    uint8_t len = cfg.rx_size < TAG_FRAME_BYTES ? cfg.rx_size : TAG_FRAME_BYTES;

    /* Prefer the preamble-window sample. The post-packet read is kept only as a
     * fallback for frames whose preamble we missed, and is flagged as such on the
     * diagnostic line so the two can never be silently mixed in analysis. */
    bool    rssi_from_preamble = rssi_sig_valid;
    int16_t rssi_half = rssi_sig_valid ? rssi_sig_half : -(int16_t)regRead(REG_RSSI_VALUE);
    uint8_t lna = regRead(REG_LNA);

    SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
    digitalWrite(PIN_RFM69_CS, LOW);
    SPI.transfer(REG_FIFO & 0x7F);
    for (uint8_t i = 0; i < len; i++) frame[i] = SPI.transfer(0x00);
    digitalWrite(PIN_RFM69_CS, HIGH);
    SPI.endTransaction();

    uint32_t isr_us = micros() - t_isr;

    /* FIX 3: report the CRC verdict through the record type, so it reaches the
     * Validated column. Nothing is dropped — a frame we cannot verify is still
     * a detection, it is just an unvalidated one, which is exactly how stock
     * reports it. RSSI is int8 dBm on both record types, matching the shipped
     * record's readInt8; half-dBm lives on the diagnostic line only. */
    bool crc_checkable = (len >= TAG_FRAME_BYTES);
    bool crcok = crc_checkable && (terraCrc8(frame, TAG_ID_BYTES) == frame[TAG_ID_BYTES]);
    int8_t rssi_dbm = (int8_t)(rssi_half / 2);

    /* SNR gate, ahead of the CRC decision: a frame the demodulator pulled out of
     * the noise is not a detection regardless of how its CRC lands. Off by
     * default (snr_min_db = 0) so the baseline stays byte-comparable with stock. */
    bool snr_ok = true;
    if (cfg.snr_min_db > 0) {
      if (!noise_valid) snr_ok = false;
      else snr_ok = ((rssi_half - noise_floor_half_dbm) >= (int16_t)cfg.snr_min_db * 2);
    }
    if (!snr_ok) { snr_rejected++; }
    else if (crcok) { emitBeep1(frame, frame[TAG_ID_BYTES], rssi_dbm); emitted++; }
    else if (!cfg.crc_gate) { emitBeep0(frame, rssi_dbm); emitted++; }
    else rejected++;   /* crc_gate is opt-in now, and off by default */
    emitDiagnostic(frame, rssi_half, fei_valid, fei_raw, lna, isr_us,
                   crc_checkable, crcok, rssi_from_preamble);
    fei_valid = false;                 /* next packet measures its own */
    rssi_sig_valid = false;
  }

  /* 2b. Re-announce a dead radio every 10 s. The boot-time line alone is
   *     invisible to anything that attaches to the socket afterwards — which is
   *     exactly how terra.1's failure went unnoticed and got called a success. */
  static uint32_t next_gripe_ms = 10000;
  if (!radio_ok && (int32_t)(millis() - next_gripe_ms) >= 0) {
    Serial.println(F("{\"error\":\"Radio Init Failed\"}"));
    next_gripe_ms = millis() + 10000;
  }

  /* 3. FIX 2: idle noise floor. Only sampled when no packet is pending, so it
   * measures the channel between detections rather than the detection itself. */
  if (radio_ok && !payload_flag && (int32_t)(millis() - next_noise_sample_ms) >= 0) {
    if (!(regRead(REG_IRQ_FLAGS2) & IRQ2_PAYLOADREADY)) sampleNoiseFloor();
    next_noise_sample_ms = millis() + 500;
  }
}

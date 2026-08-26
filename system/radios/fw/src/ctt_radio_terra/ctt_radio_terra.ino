/*
 * ctt_radio_terra — 434 MHz FSK tag receiver for the Feather 32u4 radios.
 *
 * A clean reimplementation of the shipped radio firmware's fsktag receive path,
 * plus the three things terra-rfm69 has that the shipped image does not. Written
 * from the findings of a full bench session on station V3033D413FBC rather than
 * grown by patches, so every non-obvious choice below has its reason beside it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * system/radios/fw/ss_v3.0.0.hex and ss_v4.0.0.hex have no source. They entered
 * this monorepo as built images in 2024 (9462349, 4dd1a94) with no upstream
 * pointer, and the source is not in this repo's history, the GitHub org, or any
 * Bitbucket name that could be probed. terra-rfm69's fixes therefore could not
 * be applied to it. The register configuration below was recovered from
 * ss_v4.0.0.hex by disassembly (tools/regpairs.py) and is reproduced literally;
 * tools/parity.py re-checks it against the image on every build.
 *
 * The recovered PHY turned out to BE terra-rfm69's PHY — same bitrate, deviation,
 * bandwidth, modulation, preamble and sync words. Both descend from one driver by
 * S. Blackshire. There was never a PHY to port; only the three deltas below.
 *
 * ---------------------------------------------------------------------------
 * THE THREE DELTAS vs. the shipped image
 *
 *   1. RegRssiThresh (0x29) is programmed. No literal write to 0x29 exists in
 *      either shipped image, so it sits at its 0xFF reset value. Datasheet
 *      3.5.3.1 makes -114 dBm the correct value for AGC operation. This is the
 *      same defect terra-rfm69 carried until 2026-08-12.
 *   2. Signal-quality instrumentation: per-detection RSSI, idle noise floor,
 *      SNR, FEI, LNA gain and ISR-to-FIFO latency, on a separate JSON line.
 *   3. The tag CRC byte is checked and forwarded, and the verdict reaches the
 *      station's Validated column through the record type (see OUTPUT).
 *
 * MEASURED RESULT: this does NOT detect more tags than the shipped firmware.
 * Real-tag rates match to a median ratio of 0.99 and RSSI to 1.21 dB. Its value
 * is measurement, not sensitivity. Do not deploy it expecting more detections.
 *
 * ---------------------------------------------------------------------------
 * PIN MAP — Adafruit reference wiring, each confirmed on hardware
 *
 *   CS = D8    IRQ = D7 (PE6/INT6)    RESET = D4
 *
 * IRQ was read straight out of the image: it contains exactly one attachInterrupt
 * call, with r24 = 4, and the AVR core's 32u4 branch maps case 4 to
 * EIMSK |= (1<<INT6) = PE6, which digitalPinToInterrupt() yields only for pin 7.
 * CS and RESET are the Adafruit reference pins, corroborated by readback: with
 * the wrong CS every register read returns 0xFF.
 *
 * TRAP: an earlier attempt deduced CS = D17 by elimination over the image's five
 * pinMode calls. That reasoning is invalid — pointer-based DDR writes are
 * invisible to opcode scanning, so "no pinMode call" proves nothing.
 *
 * ---------------------------------------------------------------------------
 * BUILD — adafruit:avr:feather32u4 ONLY
 *
 * The Feather 32u4 runs at 8 MHz. arduino:avr:leonardo is the same MCU at 16 MHz;
 * it flashes and verifies cleanly and then cannot enumerate USB at all, and the
 * 1200-baud touch used for recovery depends on that USB. Recovery then needs a
 * physical double-tap of RESET. See README.
 *
 * ---------------------------------------------------------------------------
 * OUTPUT — two lines per detection, pipeline record first
 *
 * The station derives its Validated column from the RECORD TYPE, not from any
 * flag: beep-formatter.js:50-54 sets Validated=1 iff the tag id is 10 hex chars,
 * i.e. a BEEP_1 carrying 4 id bytes + the CRC byte, which it then strips.
 *
 *   CRC checks out -> BEEP_1  "01" + id[4] + crc + rssi  -> Validated = 1
 *   otherwise      -> BEEP_0  "00" + id[4]       + rssi  -> Validated = 0
 *
 * Nothing is dropped for failing CRC. A frame we cannot verify is still a
 * detection, just an unvalidated one — which is how the shipped firmware reports
 * it, and several real tag families do not carry this CRC at all.
 *
 * The instrumentation rides on a second JSON line carrying a leading
 * "key":"terra_uhf". That key is load-bearing: radio-receiver.js handleLine()
 * routes a decoded line by `firmware` -> 'radio-fw', `key` -> 'response',
 * else -> 'beep'. Without it the line reached the beep path and
 * data-manager.js:113 dumped the whole object through util.inspect once per
 * detection — 8529 diagnostics produced 161,435 journal lines in 20 minutes.
 * Nothing subscribes to 'response' or 'raw', so with the key the station ignores
 * the line while socket readers still get it verbatim.
 *
 * ---------------------------------------------------------------------------
 * MEASUREMENT RULES that cost the most to learn
 *
 *  - RSSI and FEI must be sampled at SYNC MATCH. RegIrqFlags1.Rssi (bit 3) is
 *    "cleared when leaving Rx" and we never leave Rx, so it latches on the first
 *    noise burst and stays set forever (0xD8 on every channel). It is not a
 *    signal-present indicator. SyncAddressMatch (bit 0) is "cleared when leaving
 *    Rx or FIFO is emptied", and we empty the FIFO every packet, so it is a true
 *    per-frame edge — with ~1.6 ms of payload still inbound at 25 kbps.
 *    Sampling on the latched flag put every RSSI at the noise floor: 19.16 dB
 *    mean error against the shipped firmware, versus 1.21 dB at sync match.
 *  - RegRssiValue needs no trigger; it is live. Do NOT poll
 *    RegRssiConfig.RssiDone — it reads 0x00 forever on this part, and waiting on
 *    it burned 1 ms per frame and pushed isr_us from 150 us past 1200 us.
 *  - FEI does need FeiStart and 4 bit periods to settle, so it gets a short
 *    fixed delay instead of a poll.
 *  - Never conclude success from the absence of an error line. The boot-time
 *    "Radio Init Failed" is printed before any consumer can attach to the
 *    socket; a dead SPI bus looked like a healthy radio for two revisions
 *    because of it. Hence `status`, and hence the 10 s re-announce.
 */

#include <SPI.h>

/* ---- hardware ---------------------------------------------------------- */
static const uint8_t PIN_CS  = 8;   /* Adafruit reference; wrong CS => all reads 0xFF */
static const uint8_t PIN_IRQ = 7;   /* PE6 / INT6, read out of ss_v4.0.0.hex */
static const int8_t  PIN_RST = 4;   /* Adafruit reference; -1 disables the reset pulse */

static const char FIRMWARE_VERSION[] = "5.0.1-terra";

/* ---- RFM69 / SX1231 registers ------------------------------------------ */
enum {
  REG_FIFO         = 0x00, REG_OPMODE       = 0x01, REG_DATAMODUL    = 0x02,
  REG_BITRATE_MSB  = 0x03, REG_BITRATE_LSB  = 0x04,
  REG_FDEV_MSB     = 0x05, REG_FDEV_LSB     = 0x06,
  REG_FRF_MSB      = 0x07, REG_FRF_MID      = 0x08, REG_FRF_LSB      = 0x09,
  REG_PA_LEVEL     = 0x11, REG_LNA          = 0x18,
  REG_RXBW         = 0x19, REG_AFCBW        = 0x1A, REG_AFC_FEI      = 0x1E,
  REG_FEI_MSB      = 0x21, REG_FEI_LSB      = 0x22,
  REG_RSSI_VALUE   = 0x24, REG_DIO_MAPPING1 = 0x25,
  REG_IRQ_FLAGS1   = 0x27, REG_IRQ_FLAGS2   = 0x28, REG_RSSI_THRESH  = 0x29,
  REG_PREAMBLE_MSB = 0x2C, REG_PREAMBLE_LSB = 0x2D, REG_SYNC_CONFIG  = 0x2E,
  REG_SYNC_VALUE1  = 0x2F,
  REG_PACKET_CFG1  = 0x37, REG_PAYLOAD_LEN  = 0x38,
  REG_FIFO_THRESH  = 0x3C, REG_PACKET_CFG2  = 0x3D, REG_TEST_DAGC    = 0x6F,
};
enum { OPMODE_STANDBY = 0x04, OPMODE_RX = 0x10 };
enum { IRQ1_MODEREADY = 0x80, IRQ1_SYNCMATCH = 0x01, IRQ2_PAYLOADREADY = 0x04 };
enum { FEI_START = 0x20 };

/* ---- the PHY, as disassembled from ss_v4.0.0.hex ----------------------- *
 * Every value here was read out of the shipped image's fsktag preset block
 * (v4 0x1368-0x1528). They are compile-time literals on purpose: that is what
 * lets tools/parity.py extract this firmware's own register table from the .hex
 * and diff it against the image. A value reaching the radio only through a RAM
 * variable is invisible to that check, which is how a silent PHY drift gets in.
 * Runtime overrides are applied after the literal block.
 *
 * Do not "improve" these numbers here. A divergence from the shipped image is a
 * change in what the fleet hears and belongs in its own change with its own
 * field evidence. RxBw especially: widening 0xEB (50 kHz) to 0xEA (100 kHz) on a
 * live channel took real detections to ZERO while the control channel was
 * unchanged, exactly as terra-rfm69's comment warns. */
enum {
  BASE_DATAMODUL    = 0x00,  /* FSK, no shaping, packet mode */
  BASE_BITRATE_MSB  = 0x05,  /* 0x0500 = 1280 -> 25 kbps */
  BASE_BITRATE_LSB  = 0x00,
  BASE_FDEV_MSB     = 0x01,  /* 0x0199 = 409 -> 24.96 kHz */
  BASE_FDEV_LSB     = 0x99,
  BASE_FRF_MSB      = 0x6C,  /* 434.000 MHz: 434e6 / (32e6/2^19) = 0x6C8000.     */
  BASE_FRF_MID      = 0x80,  /* The shipped image computes Frf at runtime;       */
  BASE_FRF_LSB      = 0x00,  /* terra hardcodes 434.0, and regread confirms ours */
  BASE_RXBW         = 0xEB,  /* Mant 20, Exp 3 -> 50 kHz. See warning above. */
  BASE_AFCBW        = 0xEB,
  BASE_PACKET_CFG1  = 0x00,  /* fixed length, hardware CRC off (we check in software) */
  BASE_PACKET_CFG2  = 0x00,
  BASE_PAYLOAD_LEN  = 5,     /* 4 id bytes + 1 CRC byte, == terra's payload_length */
  BASE_PREAMBLE_MSB = 0x00,
  BASE_PREAMBLE_LSB = 0x02,  /* 2 bytes */
  BASE_SYNC_1       = 0xD3,  /* the only ldi site for each value in the whole image */
  BASE_SYNC_2       = 0x91,
  BASE_PA_LEVEL     = 0x5F,  /* RX-only build; kept for parity */
  BASE_FIFO_THRESH  = 0x8F,
  BASE_DIO_MAPPING1 = 0x42,  /* DIO0 = PayloadReady in RX */
  BASE_TEST_DAGC    = 0x30,
  BASE_RSSI_THRESH  = 0xE4,  /* DELTA 1: -114 dBm in -0.5 dB steps. Never written
                              * by either shipped image. */
  /* SyncOn | SyncSize=2 ((n-1)<<3) | SyncTol=0. DERIVED, not disassembled: the
   * shipped image computes 0x2E at runtime. Corroborated twice — our decoded IDs
   * equal the shipped firmware's (a different sync length would shift the payload
   * and change every ID), and sync_size:3 receives nothing at all, because the
   * byte after D3 91 is the first ID byte and varies per tag. This is already as
   * selective as the sync word can be: sync_tol:2 yields 5565 distinct IDs with
   * real detections flat, and sync_size:1 breaks framing entirely. */
  BASE_SYNC_CONFIG  = 0x88,
};

static const uint8_t TAG_ID_BYTES    = 4;
static const uint8_t TAG_FRAME_BYTES = 5;

/* ---- runtime config ----------------------------------------------------- *
 * Key names mirror the shipped firmware's command surface, discovered by probing
 * a live radio (tools/probe-radio-config.mjs): rxbw, modulation, rx_type,
 * rx_size, tx_dbm, preset and version all answer there. The rest are new. */
struct Config {
  uint8_t rxbw;
  uint8_t rx_size;
  uint8_t modulation;
  uint8_t sync_config;
  int8_t  rssi_thresh_dbm;
  /* Minimum SNR in dB for a detection to reach the pipeline. The sync word
   * cannot discriminate any further (see BASE_SYNC_CONFIG), so this is the only
   * selectivity knob left, and it is almost certainly what the shipped firmware
   * applies in software: sweeping it 0->10 dB took distinct IDs from 64 to 20,
   * where the shipped firmware logs 21, with CRC-valid real detections flat at
   * 18-19. Defaulted to 3 because observed real tags on a quiet channel sit at
   * SNR 3-4 dB and a higher floor would discard them. Set 0 for a
   * stock-comparable A/B. */
  int8_t  snr_min_db;
};
static Config cfg = { BASE_RXBW, BASE_PAYLOAD_LEN, BASE_DATAMODUL,
                      BASE_SYNC_CONFIG, -114, 3 };

static uint8_t rssiThreshReg(int8_t dbm) { return (uint8_t)(-2 * (int16_t)dbm); }

/* ---- state -------------------------------------------------------------- */
static bool     radio_ok = false;
static uint32_t emitted = 0, snr_dropped = 0;
static uint32_t fei_ok = 0, rssi_ok = 0;

/* Captured at sync match, consumed at PayloadReady. "Not measured" is reported
 * by omitting the keys, never as a zero — a zero frequency error and a missed
 * measurement are different facts. */
static int16_t  cap_rssi_half = 0, cap_fei = 0;
static bool     cap_rssi_valid = false, cap_fei_valid = false;

/* Idle noise floor as an integer EWMA in half-dBm. Integer on purpose: AVR
 * floats cost flash and cycles for precision 0.5 dB quantisation discards. */
static int16_t  noise_half = 0;
static bool     noise_valid = false;
static uint32_t next_noise_ms = 0;

static volatile bool     payload_flag = false;
static volatile uint32_t payload_us = 0;
static volatile uint32_t irq_count = 0;

/* ---- SPI ---------------------------------------------------------------- *
 * Single-threaded by construction: the ISR only stamps a flag, so the main loop
 * owns the bus outright. terra-rfm69 needs rfm69_spi_lock because it has four
 * threads; here there is no lock to forget. */
static void regWrite(uint8_t reg, uint8_t val) {
  SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(reg | 0x80);
  SPI.transfer(val);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
}

static uint8_t regRead(uint8_t reg) {
  SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(reg & 0x7F);
  uint8_t v = SPI.transfer(0x00);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
  return v;
}

static void setMode(uint8_t mode) {
  regWrite(REG_OPMODE, (regRead(REG_OPMODE) & 0xE3) | mode);
  uint32_t deadline = millis() + 1000;      /* bounded: a dead radio must not wedge us */
  while (!(regRead(REG_IRQ_FLAGS1) & IRQ1_MODEREADY) && millis() < deadline) { }
}

/* ---- terra's tag CRC-8 -------------------------------------------------- *
 * Same polynomial and seed as firmware/terra-rfm69/terra_crc8.c, so a frame
 * judged good here is judged good there. Only some CTT tag families carry it:
 * tags whose 5th byte varies frame to frame (36 distinct values over 46 frames
 * for one of them) are not carrying this CRC, which is why a failure labels a
 * detection rather than discarding it. */
static uint8_t terraCrc8(const uint8_t *data, uint8_t len) {
  uint8_t crc = 0x00;
  for (uint8_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (uint8_t b = 0; b < 8; b++)
      crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
  }
  return crc;
}

/* ---- init --------------------------------------------------------------- */
static void radioReset() {
  if (PIN_RST < 0) return;
  pinMode((uint8_t)PIN_RST, OUTPUT);
  digitalWrite((uint8_t)PIN_RST, HIGH);   /* datasheet 7.2.2: RESET is active HIGH, */
  delay(10);                              /* pulled high then released, then 5 ms.  */
  digitalWrite((uint8_t)PIN_RST, LOW);
  delay(10);
}

static void radioConfigure() {
  regWrite(REG_TEST_DAGC,    BASE_TEST_DAGC);
  regWrite(REG_DATAMODUL,    BASE_DATAMODUL);
  regWrite(REG_BITRATE_MSB,  BASE_BITRATE_MSB);
  regWrite(REG_BITRATE_LSB,  BASE_BITRATE_LSB);
  regWrite(REG_FDEV_MSB,     BASE_FDEV_MSB);
  regWrite(REG_FDEV_LSB,     BASE_FDEV_LSB);
  regWrite(REG_FRF_MSB,      BASE_FRF_MSB);
  regWrite(REG_FRF_MID,      BASE_FRF_MID);
  regWrite(REG_FRF_LSB,      BASE_FRF_LSB);
  regWrite(REG_RXBW,         BASE_RXBW);
  regWrite(REG_AFCBW,        BASE_AFCBW);
  regWrite(REG_PACKET_CFG1,  BASE_PACKET_CFG1);
  regWrite(REG_PACKET_CFG2,  BASE_PACKET_CFG2);
  regWrite(REG_PAYLOAD_LEN,  BASE_PAYLOAD_LEN);
  regWrite(REG_PREAMBLE_MSB, BASE_PREAMBLE_MSB);
  regWrite(REG_PREAMBLE_LSB, BASE_PREAMBLE_LSB);
  regWrite(REG_SYNC_CONFIG,  BASE_SYNC_CONFIG);
  regWrite(REG_SYNC_VALUE1,     BASE_SYNC_1);
  regWrite(REG_SYNC_VALUE1 + 1, BASE_SYNC_2);
  regWrite(REG_PA_LEVEL,     BASE_PA_LEVEL);
  regWrite(REG_FIFO_THRESH,  BASE_FIFO_THRESH);
  regWrite(REG_DIO_MAPPING1, BASE_DIO_MAPPING1);
  regWrite(REG_RSSI_THRESH,  BASE_RSSI_THRESH);   /* DELTA 1 */
}

/* Anything the station changed at runtime, re-applied over the literal baseline.
 * No-ops at boot, because cfg starts at the baseline. */
static void applyOverrides() {
  if (cfg.modulation  != BASE_DATAMODUL)   regWrite(REG_DATAMODUL,   cfg.modulation);
  if (cfg.rxbw        != BASE_RXBW)        regWrite(REG_RXBW,        cfg.rxbw);
  if (cfg.rx_size     != BASE_PAYLOAD_LEN) regWrite(REG_PAYLOAD_LEN, cfg.rx_size);
  if (cfg.sync_config != BASE_SYNC_CONFIG) regWrite(REG_SYNC_CONFIG, cfg.sync_config);
  if (rssiThreshReg(cfg.rssi_thresh_dbm) != BASE_RSSI_THRESH)
    regWrite(REG_RSSI_THRESH, rssiThreshReg(cfg.rssi_thresh_dbm));
}

static void onPayloadReady() { payload_us = micros(); payload_flag = true; irq_count++; }

/* ---- measurement -------------------------------------------------------- */
static void captureAtSyncMatch() {
  if (cap_rssi_valid && cap_fei_valid) return;
  if (!(regRead(REG_IRQ_FLAGS1) & IRQ1_SYNCMATCH)) return;

  if (!cap_rssi_valid) {                 /* live register: no trigger, no poll */
    cap_rssi_half = -(int16_t)regRead(REG_RSSI_VALUE);
    cap_rssi_valid = true;
    rssi_ok++;
  }
  if (!cap_fei_valid) {
    regWrite(REG_AFC_FEI, FEI_START);
    delayMicroseconds(200);              /* 4 bit periods = 160 us at 25 kbps */
    cap_fei = (int16_t)(((uint16_t)regRead(REG_FEI_MSB) << 8) | regRead(REG_FEI_LSB));
    cap_fei_valid = true;
    fei_ok++;
  }
}

static void sampleNoiseFloor() {
  int16_t s = -(int16_t)regRead(REG_RSSI_VALUE);
  if (!noise_valid) { noise_half = s; noise_valid = true; return; }
  noise_half += (s - noise_half) >> 3;   /* EWMA, alpha = 1/8 */
}

/* ---- output ------------------------------------------------------------- */
static void emitBeep0(const uint8_t *id, int8_t rssi_dbm) {
  char line[16];
  snprintf(line, sizeof(line), "00%02X%02X%02X%02X%02X",
           id[0], id[1], id[2], id[3], (uint8_t)rssi_dbm);
  Serial.println(line);
}

static void emitBeep1(const uint8_t *id, uint8_t crc, int8_t rssi_dbm) {
  char line[16];
  snprintf(line, sizeof(line), "01%02X%02X%02X%02X%02X%02X",
           id[0], id[1], id[2], id[3], crc, (uint8_t)rssi_dbm);
  Serial.println(line);
}

/* Half-dBm printed as d.d by hand: pulling float support into vfprintf would
 * cost more flash than the whole measurement path. */
static void printTenths(int16_t half_dbm) {
  int16_t t = half_dbm * 5;
  Serial.print(t / 10); Serial.print('.'); Serial.print(abs(t % 10));
}

static void emitDiagnostic(const uint8_t *frame, bool crc_checkable, bool crcok,
                           uint8_t lna, uint32_t isr_us) {
  /* The leading "key" is load-bearing, not decoration. radio-receiver.js
   * handleLine() routes a decoded line by inspecting it in order: `firmware` ->
   * 'radio-fw', `key` -> 'response', otherwise -> 'beep'. Without `key` this
   * line reached the beep path, and data-manager.js:113 dispatches on
   * `if (beep.meta)` then switches on meta.data_type — so "terra_uhf" fell to
   * `default: console.log(beep); console.error("i don't know what to do...")`,
   * dumping the whole object through util.inspect. Measured on the bench: 8529
   * diagnostics in 20 minutes produced 161,435 journal lines, ~8000/min of
   * eMMC churn. Nothing subscribes to 'response', so with `key` present the line
   * is silently ignored by the station while socket readers (tools/probe-radio-
   * config.mjs) still see it verbatim — which is where the diagnostics belong. */
  Serial.print(F("{\"key\":\"terra_uhf\",\"meta\":{\"data_type\":\"terra_uhf\",\"rssi\":"));
  printTenths(cap_rssi_half);
  Serial.print(F(",\"rssi_src\":\""));
  Serial.print(cap_rssi_valid ? F("sync") : F("late"));
  Serial.print('"');
  if (noise_valid) {
    Serial.print(F(",\"noise\":")); printTenths(noise_half);
    Serial.print(F(",\"snr\":"));   printTenths(cap_rssi_half - noise_half);
  }
  if (cap_fei_valid) {
    Serial.print(F(",\"fei_raw\":")); Serial.print(cap_fei);
    Serial.print(F(",\"fei_hz\":"));  Serial.print((int32_t)cap_fei * 61);
  }
  Serial.print(F(",\"lna\":"));    Serial.print(lna & 0x07);
  Serial.print(F(",\"isr_us\":")); Serial.print(isr_us);
  if (crc_checkable) {
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

static void printStatus() {
  uint8_t sc = regRead(REG_SYNC_CONFIG);
  Serial.print(F("{\"key\":\"status\",\"res\":true,\"radio_ok\":")); Serial.print(radio_ok ? 1 : 0);
  Serial.print(F(",\"opmode\":\""));      Serial.print(regRead(REG_OPMODE), HEX);
  Serial.print(F("\",\"irqflags1\":\"")); Serial.print(regRead(REG_IRQ_FLAGS1), HEX);
  Serial.print(F("\",\"irqflags2\":\"")); Serial.print(regRead(REG_IRQ_FLAGS2), HEX);
  Serial.print(F("\",\"rssi_raw\":"));    Serial.print(regRead(REG_RSSI_VALUE));
  Serial.print(F(",\"rssi_thresh\":\"")); Serial.print(regRead(REG_RSSI_THRESH), HEX);
  Serial.print(F("\",\"rxbw\":\""));      Serial.print(regRead(REG_RXBW), HEX);
  Serial.print(F("\",\"payload_len\":")); Serial.print(regRead(REG_PAYLOAD_LEN));
  Serial.print(F(",\"sync1\":\""));       Serial.print(regRead(REG_SYNC_VALUE1), HEX);
  Serial.print(F("\",\"sync2\":\""));     Serial.print(regRead(REG_SYNC_VALUE1 + 1), HEX);
  Serial.print(F("\",\"sync_size\":"));   Serial.print(((sc >> 3) & 0x07) + 1);
  Serial.print(F(",\"sync_tol\":"));      Serial.print(sc & 0x07);
  Serial.print(F(",\"snr_min\":"));       Serial.print(cfg.snr_min_db);
  Serial.print(F(",\"emitted\":"));       Serial.print(emitted);
  Serial.print(F(",\"snr_dropped\":"));   Serial.print(snr_dropped);
  Serial.print(F(",\"rssi_ok\":"));       Serial.print(rssi_ok);
  Serial.print(F(",\"fei_ok\":"));        Serial.print(fei_ok);
  Serial.print(F(",\"irq_count\":"));     Serial.print(irq_count);
  Serial.println('}');
}

/* ---- commands ----------------------------------------------------------- *
 * Grammar and reply shape copied from the shipped firmware (key:value, answered
 * with {"key":..,"res":..[,"err":..]}), so existing per-channel config strings in
 * default-config.js keep working unchanged. */
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
    if (strcmp(arg, "fsktag")) { reply(cmd, false, "unsupported preset"); return; }
    setMode(OPMODE_STANDBY); radioConfigure(); applyOverrides(); setMode(OPMODE_RX);
    reply(cmd, true, NULL); return;
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
  if (!strcmp(cmd, "rssi_thresh")) {
    long dbm = strtol(arg, NULL, 10);
    if (dbm > -20 || dbm < -127) { reply(cmd, false, "range"); return; }
    cfg.rssi_thresh_dbm = (int8_t)dbm;
    regWrite(REG_RSSI_THRESH, rssiThreshReg(cfg.rssi_thresh_dbm));
    reply(cmd, true, NULL); return;
  }
  if (!strcmp(cmd, "snr_min")) {
    long n = strtol(arg, NULL, 10);
    if (n < 0 || n > 40) { reply(cmd, false, "range 0-40"); return; }
    cfg.snr_min_db = (int8_t)n; reply(cmd, true, NULL); return;
  }
  /* sync_size beyond 2 also needs the extra bytes programmed via sync_val: the
   * higher RegSyncValue registers reset to 0x00 and the byte the tag sends after
   * D3 91 is the first ID byte. Expect zero detections at size 3+ until sync_val
   * says otherwise — that is why both commands exist. */
  if (!strcmp(cmd, "sync_size")) {
    long n = strtol(arg, NULL, 10);
    if (n < 1 || n > 8) { reply(cmd, false, "range 1-8"); return; }
    cfg.sync_config = (uint8_t)((cfg.sync_config & ~0x38) | (((uint8_t)n - 1) << 3));
    regWrite(REG_SYNC_CONFIG, cfg.sync_config); reply(cmd, true, NULL); return;
  }
  if (!strcmp(cmd, "sync_tol")) {          /* raising this makes us LESS selective */
    long n = strtol(arg, NULL, 10);
    if (n < 0 || n > 7) { reply(cmd, false, "range 0-7"); return; }
    cfg.sync_config = (uint8_t)((cfg.sync_config & ~0x07) | (uint8_t)n);
    regWrite(REG_SYNC_CONFIG, cfg.sync_config); reply(cmd, true, NULL); return;
  }
  if (!strcmp(cmd, "sync_val")) {          /* idx:hex, idx 1..4 */
    char *c2 = strchr(arg, ':');
    if (!c2) { reply(cmd, false, "want idx:hex"); return; }
    *c2 = '\0';
    long idx = strtol(arg, NULL, 10), v = strtol(c2 + 1, NULL, 16);
    if (idx < 1 || idx > 4 || v < 0 || v > 255) { reply(cmd, false, "range"); return; }
    regWrite((uint8_t)(REG_SYNC_VALUE1 + idx - 1), (uint8_t)v);
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

/* ---- main --------------------------------------------------------------- */
void setup() {
  Serial.begin(115200);
  pinMode(PIN_CS, OUTPUT);
  digitalWrite(PIN_CS, HIGH);
  pinMode(PIN_IRQ, INPUT);
  SPI.begin();

  radioReset();
  setMode(OPMODE_STANDBY);
  radioConfigure();
  applyOverrides();

  /* Readback proves the SPI path: we know what was just written to SyncValue1,
   * and a wrong CS makes every read 0xFF. Without this gate a dead bus reads
   * IrqFlags2 = 0xFF, whose PayloadReady bit is set, and the receiver
   * manufactures endless FFFFFFFF detections. */
  radio_ok = (regRead(REG_SYNC_VALUE1) == BASE_SYNC_1) && (regRead(REG_OPMODE) != 0xFF);
  if (!radio_ok) Serial.println(F("{\"error\":\"Radio Init Failed\"}"));

  attachInterrupt(digitalPinToInterrupt(PIN_IRQ), onPayloadReady, RISING);
  setMode(OPMODE_RX);
}

void loop() {
  /* 1. Capture first: the sync-match window is the whole point. */
  if (radio_ok) captureAtSyncMatch();

  /* 2. Commands. */
  static char buf[48];
  static uint8_t n = 0;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') { buf[n] = '\0'; if (n) handleCommand(buf); n = 0; continue; }
    if (n < sizeof(buf) - 1) buf[n++] = c;
  }

  /* 3. Detections. Either the DIO0 edge fired or IrqFlags2 says a payload is
   *    waiting; polling is the load-bearing path because relying on the edge
   *    alone left a channel silent for an entire revision. 0xFF is a dead bus,
   *    not a status byte, so it is refused explicitly. */
  uint8_t irq2 = radio_ok ? regRead(REG_IRQ_FLAGS2) : 0x00;
  bool ready = radio_ok && irq2 != 0xFF &&
               (payload_flag || (irq2 & IRQ2_PAYLOADREADY));
  if (ready) {
    noInterrupts();
    uint32_t t_isr = payload_flag ? payload_us : micros();
    payload_flag = false;
    interrupts();

    uint8_t frame[TAG_FRAME_BYTES] = { 0 };
    uint8_t len = cfg.rx_size < TAG_FRAME_BYTES ? cfg.rx_size : TAG_FRAME_BYTES;
    if (!cap_rssi_valid) cap_rssi_half = -(int16_t)regRead(REG_RSSI_VALUE); /* fallback */
    uint8_t lna = regRead(REG_LNA);

    SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
    digitalWrite(PIN_CS, LOW);
    SPI.transfer(REG_FIFO & 0x7F);
    for (uint8_t i = 0; i < len; i++) frame[i] = SPI.transfer(0x00);
    digitalWrite(PIN_CS, HIGH);
    SPI.endTransaction();

    uint32_t isr_us = micros() - t_isr;
    bool crc_checkable = (len >= TAG_FRAME_BYTES);
    bool crcok = crc_checkable &&
                 (terraCrc8(frame, TAG_ID_BYTES) == frame[TAG_ID_BYTES]);

    /* SNR gate. Fails OPEN when the noise floor is not yet known — at boot that
     * is every frame, and dropping them would be a self-inflicted outage. */
    bool snr_ok = true;
    if (cfg.snr_min_db > 0 && noise_valid)
      snr_ok = (cap_rssi_half - noise_half) >= (int16_t)cfg.snr_min_db * 2;

    if (!snr_ok) snr_dropped++;
    else {
      int8_t rssi_dbm = (int8_t)(cap_rssi_half / 2);
      if (crcok) emitBeep1(frame, frame[TAG_ID_BYTES], rssi_dbm);
      else       emitBeep0(frame, rssi_dbm);
      emitted++;
    }
    emitDiagnostic(frame, crc_checkable, crcok, lna, isr_us);  /* always, even if gated */
    cap_rssi_valid = cap_fei_valid = false;
  }

  /* 4. Idle noise floor, and a standing complaint if the radio is unreachable. */
  static uint32_t next_gripe_ms = 10000;
  if (!radio_ok && (int32_t)(millis() - next_gripe_ms) >= 0) {
    Serial.println(F("{\"error\":\"Radio Init Failed\"}"));
    next_gripe_ms = millis() + 10000;
  }
  if (radio_ok && !payload_flag && (int32_t)(millis() - next_noise_ms) >= 0) {
    if (!(regRead(REG_IRQ_FLAGS2) & IRQ2_PAYLOADREADY)) sampleNoiseFloor();
    next_noise_ms = millis() + 500;
  }
}

import MessageTypes from '../../../hardware/ctt/messages.js'

/**
 * file formatter for terra (5.x RFM69) per-detection radio metrics.
 *
 * The terra 434 MHz firmware emits, alongside its legacy coded-id beep, a
 * `terra_uhf` JSON document carrying the receiver measurements the legacy beep
 * has no room for: the sampled noise floor, the computed SNR, the frequency
 * error (FEI) and the LNA gain state. The legacy beep still lands in raw-data
 * (RadioId/TagId/TagRSSI/Validated); this sink captures the extra measurements
 * so they are not lost. Only 5.x (terra) firmware produces these — 4.x radios
 * emit no `terra_uhf` record, so their rows simply never appear here.
 *
 * Following the firmware's own convention (see terra_metrics.h), a measurement
 * the radio marked invalid is written as an EMPTY cell, never 0 or a sentinel:
 * "the FEI read timed out" and "the offset was 0 Hz" are different facts.
 */
class TerraMetricsFormatter {
  /**
   *
   * @param {*} opts
   */
  constructor(opts) {
    this.header = [
      'Time',
      'RadioId',
      'TagId',
      'TagRSSI',
      'NoiseFloor',
      'SNR',
      'FEI_Hz',
      'LNA',
      'RSSISrc',
      'CrcOk',
    ]
    this.date_format = opts.date_format
  }

  /**
   *
   * @param {object} record - parsed terra_uhf document from the radio
   * @param {Number|String} record.channel - radio channel (RadioId)
   * @param {moment} record.received_at - time the line was received
   * @param {object} record.meta - receiver measurements (rssi/noise/snr/fei/lna)
   * @param {object} record.data - { id: tag id }
   */
  formatRecord(record) {
    const { meta, data, channel, received_at } = record
    if (meta?.data_type !== MessageTypes.TerraUhf) {
      console.log('unexpected record to format in terra metrics formatter', meta)
      return null
    }
    // empty cell for a missing/invalid measurement; 0 is a real value and kept
    const cell = (v) => (v === undefined || v === null ? '' : v)
    return [
      received_at.format(this.date_format),
      channel,
      (data?.id ?? '').toString().toUpperCase(),
      cell(meta.rssi),
      cell(meta.noise),
      cell(meta.snr),
      cell(meta.fei_hz),
      cell(meta.lna),
      cell(meta.rssi_src),
      cell(meta.crcok),
    ]
  }
}

export { TerraMetricsFormatter }

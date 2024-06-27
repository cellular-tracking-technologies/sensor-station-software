const defs = Object.freeze({
  protocol: {
    PROTOCOL_OUT_BEEP_0: 0,
    PROTOCOL_OUT_BEEP_1: 1,
    PROTOCOL_OUT_BEEP_2: 2,
    PROTOCOL_OUT_ES200_0: 3,
    PROTOCOL_OUT_NODE2_HEALTH: 4,
    PROTOCOL_OUT_NODE2_BEEP: 5,
    PROTOCOL_OUT_NODE3_HEALTH: 6,
    PROTOCOL_OUT_NODE3_BEEP_SUB_GHZ_0: 7,
    PROTOCOL_OUT_NODE3_BEEP_BLE_0: 8,
  },
  node: {
    PROTOCOL_NODE_MESSAGE_TYPE_NODE2_BEEP: 2,
    PROTOCOL_NODE_MESSAGE_TYPE_NODE2_HEALTH: 3,
    PROTOCOL_NODE_MESSAGE_TYPE_NODE3_BEEP_BLE: 4,
    PROTOCOL_NODE_MESSAGE_TYPE_NODE3_BEEP_SUB_GHZ: 5,
    PROTOCOL_NODE_MESSAGE_TYPE_NODE3_HEALTH: 6,
  },
  es200: {
    PROTOCOL_ES200_MESSAGE_TYPE_TELEMETRY_RECORD: 0,
  }
})

function is_hex_string(line) {
  return /[0-9A-Fa-f]/g.test(line)
}

/**
 * 
 * @param {Buffer} buf 
 * @returns 
 */
function parse_beep_0(buf) {
  if (buf[0] != defs.protocol.PROTOCOL_OUT_BEEP_0) {
    return null
  } else if (buf.length != 6) {
    return null
  }

  return {
    protocol: "1.0.0",
    meta: {
      data_type: "coded_id",
      rssi: buf.readInt8(5)
    },
    data: { id: buf.toString('hex', 1, 5).toUpperCase() }
  }
}

/**
 * 
 * @param {Buffer} buf 
 * @returns 
 */
function parse_beep_1(buf) {
  if (buf[0] != defs.protocol.PROTOCOL_OUT_BEEP_1) {
    return null
  } else if (buf.length != 7) {
    return null
  }

  return {
    protocol: "1.0.0",
    meta: {
      data_type: "coded_id",
      rssi: buf.readInt8(6)
    },
    data: { id: buf.toString('hex', 1, 6).toUpperCase() }
  }
}

function parse_beep_2(buffer) {
  return null /** Currently Unsupported */
}

/**
 * 
 * @param {Buffer} buf
 * @returns 
 * @example 
 * 
 * {
      "protocol": "1.0.0",
      "meta": {
          "data_type": "telemetry",
          "source": {
              "type": "tracker",
              "id": "78563412"
          },
          "rssi": -58
      },
      "data": {
          "lat": 36.434543,
          "lon": -75.394546,
          "hdop": 4.15,
          "battery": 3.89,
          "time": 1717008284,
          "act": 1337,
          "speed": 99,
          "altitude": 101,
          "solar_ma": 20,
          "temp_c": -15,
          "ttff": 90
      }
  }
 * 
 */
function parse_es200(buf) {
  return {
    protocol: "1.0.0",
    meta: {
      data_type: "telemetry",
      source: {
        type: "tracker",
        id: buf.readUint32LE(1).toString(16).toUpperCase()
      },
      rssi: buf.readInt8(35)
    },
    data: {
      time: buf.readUint32LE(7),
      lat: buf.readFloatLE(11),
      lon: buf.readFloatLE(15),
      act: buf.readUInt32LE(19),
      hdop: buf.readUint16LE(23),
      speed: buf.readUint8(25),
      altitude: buf.readInt16LE(26),
      battery: buf.readUint16LE(28),
      solar_ma: buf.readUint8(30),
      temp_c: buf.readInt8(31),
      ttff: buf.readUint8(32),
    }
  }
}

/**
 * 
 * @param {Buffer} buf 
 * @returns 
 */
function parse_node2_health(buf) {
  if (buf[0] != defs.protocol.PROTOCOL_OUT_NODE2_HEALTH) {
    return null
  } else if (buf.length != 40) {
    return null
  }

  return {
    protocol: "1.0.0",
    meta: {
      data_type: "node_health",
      source: {
        type: "node",
        id: buf.readUint32LE(1).toString(16).toUpperCase()
      },
      rssi: buf.readInt8(39)
    },
    data: {
      sent_at: buf.readUint32LE(7),
      fw: `${buf.readUint8(11)}.${buf.readUint8(12)}.${buf.readUint8(13)}`,
      temp_c: buf.readInt8(14),
      bat_v: buf.readUint16LE(15),
      sol_v: buf.readUint16LE(17),
      sol_ma: buf.readUint16LE(19),
      sum_sol_ma: buf.readUint32LE(21),
      fix_at: buf.readUint32LE(25),
      lat: buf.readInt32LE(29),
      lon: buf.readInt32LE(33)
    }
  }
}

/**
 * 
 * @param {Buffer} buf 
 * @returns 
 */
function parse_node2_beep(buf) {
  if (buf[0] != defs.protocol.PROTOCOL_OUT_NODE2_BEEP) {
    return null
  } else if (buf.length != 29) {
    return null
  }

  return {
    protocol: "1.0.0",
    meta: {
      data_type: "node_coded_id",
      source: {
        type: "node",
        id: buf.readUint32LE(1).toString(16).toUpperCase()
      },
      collection: {
        id: buf.readUint32LE(7),
        count: buf.readUint16LE(11),
        idx: buf.readUint16LE(13),
      },
      rssi: buf.readInt8(28)
    },
    data: {
      rec_at: buf.readUint32LE(15),
      id: buf.toString('hex', 19, 19 + buf.readUint8(24)).toUpperCase(),
      rssi: buf.readInt8(25)
    }
  }
}

/**
 * 
 * @param {Buffer} buf 
 * @returns 
 */
function parse_node3_health(buf) {
  return {
    protocol: "1.0.0",
    meta: {
      data_type: "node_health",
      source: {
        type: "node",
        id: buf.readUint32LE(1).toString(16).toUpperCase()
      },
      rssi: buf.readInt8(39)
    },
    data: {
      sent_at: buf.readUint32LE(7),
      up_time: buf.readUint32LE(11),
      batt_mv: buf.readUint8(15) * 100,
      charge_ma_avg: buf.readUint16LE(16) * 10,
      temp_batt: buf.readInt8(18),
      energy_used: buf.readUint16LE(19),
      sd_free: buf.readInt8(21),
      detections: buf.readUint16LE(22),
      errors: buf.readUint8(24),
      fix_at: buf.readUint32LE(25),
      lat: buf.readInt32LE(29),
      lon: buf.readInt32LE(33)
    }
  }
}

/**
 * 
 * @param {Buffer} buf 
 * @returns 
 */
function parse_node3_beep_sub_ghz(buf) {
  return {
    protocol: "1.0.0",
    meta: {
      data_type: "node_coded_id",
      source: {
        type: "node",
        id: buf.readUint32LE(1).toString(16).toUpperCase()
      },
      collection: {
        id: buf.readUint8(7),
        count: buf.readUint8(8),
        idx: buf.readUint8(9),
      },
      rssi: buf.readInt8(23)
    },
    data: {
      rec_at: buf.readUint32LE(10),
      id: buf.toString('hex', 14, 14 + buf.readUint8(19)).toUpperCase(),
      rssi: buf.readInt8(20)
    }
  }
}

/**
 * 
 * @param {Buffer} buf 
 * @returns 
 */
function parse_node3_beep_ble(buf) {
  return {
    protocol: "1.0.0",
    meta: {
      data_type: "node_blu",
      source: {
        type: "node",
        id: buf.readUint32LE(1).toString(16).toUpperCase()
      },
      collection: {
        id: buf.readUint8(7),
        count: buf.readUint8(8),
        idx: buf.readUint8(9),
      },
      rssi: buf.readInt8(23)
    },
    data: {
      rec_at: buf.readUint32LE(10),
      id: buf.readUint32LE(14).toString(16).padStart(8, "0").toUpperCase(),
      sync: buf.readUint16LE(18),
      rssi: buf.readInt8(20)
    }
  }
}

/**
 * 
 * @param {String} line 
 * @returns 
 */
function parse_hex_payload(line) {
  var chunk = Buffer.from(line, 'hex')

  switch (chunk[0]) {
    case defs.protocol.PROTOCOL_OUT_BEEP_0:
      return parse_beep_0(chunk)
    case defs.protocol.PROTOCOL_OUT_BEEP_1:
      return parse_beep_1(chunk)
    case defs.protocol.PROTOCOL_OUT_BEEP_2:
      return parse_beep_2(chunk)
    case defs.protocol.PROTOCOL_OUT_ES200_0:
      return parse_es200(chunk)
    case defs.protocol.PROTOCOL_OUT_NODE2_HEALTH:
      return parse_node2_health(chunk)
    case defs.protocol.PROTOCOL_OUT_NODE2_BEEP:
      return parse_node2_beep(chunk)
    case defs.protocol.PROTOCOL_OUT_NODE3_HEALTH:
      return parse_node3_health(chunk)
    case defs.protocol.PROTOCOL_OUT_NODE3_BEEP_SUB_GHZ_0:
      return parse_node3_beep_sub_ghz(chunk)
    case defs.protocol.PROTOCOL_OUT_NODE3_BEEP_BLE_0:
      return parse_node3_beep_ble(chunk)
    default:
      return null
  }
}

/**
 * Determines if the input character is in the hexidecimal space
 * @param {String} code A String of length 1
 * @returns {Boolean} True if the character is supported by hexidecimal notation
 */
function is_hex_char(code) {
  switch (code) {
    case 'a': case 'A':
    case 'b': case 'B':
    case 'c': case 'C':
    case 'd': case 'D':
    case 'e': case 'E':
    case 'f': case 'F':
    case '0': case '1': case '2': case '3': case '4':
    case '5': case '6': case '7': case '8': case '9':
      return true
    default:
      return false
  }
}

/**
 * Searches the incoming string for the first occurrence of a valid payload
 * @param {String} line Line from the receiver
 * @return {?String} Beginning of a payload
 */
function find_payload_start(line) {
  if (line === undefined) {
    return null
  } else if (line === null) {
    return null
  }

  for (let i = 0; i < line.length; i++) {
    if (is_hex_char(line[i])) {
      return line.slice(i)
    } else if (line[i] === '{') {
      return line.slice(i)
    }
  };

  return null
}

/**
 * Ingests a line delimited payload from an atmega32u4_receiver from the 
 * CTT SensorStation and converts it to an object
 *
 * @module
 * @param {String} line Line from the receiver
 * @return {?object} A receiver payload object on success, otherwise null
 * @note This module is compatible with station radio firmware >= 3.0.0
 */
export default function parse(line) {

  /** Incoming lines can be corrupted, where the first few characters 
   * are non-ascii. We are interested in finding the start index of payload,
   * defined as an opening brace (In the case of JSON), or an alpha numeric 
   * character (in the case of a hex string payload)
  */
  const payload = find_payload_start(line)
  if (payload === null) {
    return null
  }

  /** Interpret the payload as JSON if the first character is left curly brace */
  if (payload[0] === '{') {
    try {
      return JSON.parse(payload)
    } catch (ex) {
      return null
    }
  }

  /** Payload corresponds to optimized hex string format. Convert to js object */
  if (is_hex_string(line) === true) {
    return parse_hex_payload(line)
  }

  /** Payload is unsupported */
  return null
}
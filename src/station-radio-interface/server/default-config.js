export default {
  "radios": [
    {
      "channel": 1,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 2,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 3,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 4,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 5,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 6,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 7,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 8,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 9,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 10,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 11,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    },
    {
      "channel": 12,
      "config": [
        "preset:fsktag"
      ],
      "record": true
    }
  ],
  "http": {
    "websocket_port": 8001,
    "flush_websocket_messages_seconds": 1
  },
  "record": {
    "enabled": true,
    "alive_frequency_seconds": 600,
    "date_format": "YYYY-MM-DD HH:mm:ss",
    "flush_data_cache_seconds": 5,
    "checkin_frequency_minutes": 360,
    "sensor_data_frequency_minutes": 60,
    "rotation_frequency_minutes": 60,
    "base_log_directory": "/data",
    "mobile": false
  },
  "upload": {
    "ctt": true,
    "sensorgnome": true
  },
  "led": {
    "toggle_frequency_seconds": 1
  },
  "gps": {
    "enabled": true,
    "record": true,
    "seconds_between_fixes": 900
  },
  "blu_receivers": [
    {
      "channel": 1,
      "blu_radios": [
        {
          "radio": 1,
          "poll_interval": 10000
        },
        {
          "radio": 2,
          "poll_interval": 10000
        },
        {
          "radio": 3,
          "poll_interval": 10000
        },
        {
          "radio": 4,
          "poll_interval": 10000
        }
      ]
    },
    {
      "channel": 2,
      "blu_radios": [
        {
          "radio": 1,
          "poll_interval": 10000
        },
        {
          "radio": 2,
          "poll_interval": 10000
        },
        {
          "radio": 3,
          "poll_interval": 10000
        },
        {
          "radio": 4,
          "poll_interval": 10000
        }
      ]
    },
    {
      "channel": 3,
      "blu_radios": [
        {
          "radio": 1,
          "poll_interval": 10000
        },
        {
          "radio": 2,
          "poll_interval": 10000
        },
        {
          "radio": 3,
          "poll_interval": 10000
        },
        {
          "radio": 4,
          "poll_interval": 10000
        }
      ]
    },
    {
      "channel": 4,
      "blu_radios": [
        {
          "radio": 1,
          "poll_interval": 10000
        },
        {
          "radio": 2,
          "poll_interval": 10000
        },
        {
          "radio": 3,
          "poll_interval": 10000
        },
        {
          "radio": 4,
          "poll_interval": 10000
        }
      ]
    },
    {
      "channel": 5,
      "blu_radios": [
        {
          "radio": 1,
          "poll_interval": 10000
        },
        {
          "radio": 2,
          "poll_interval": 10000
        },
        {
          "radio": 3,
          "poll_interval": 10000
        },
        {
          "radio": 4,
          "poll_interval": 10000
        }
      ]
    },
    {
      "channel": 6,
      "blu_radios": [
        {
          "radio": 1,
          "poll_interval": 10000
        },
        {
          "radio": 2,
          "poll_interval": 10000
        },
        {
          "radio": 3,
          "poll_interval": 5000
        },
        {
          "radio": 4,
          "poll_interval": 5000
        }
      ]
    },
    {
      "channel": 7,
      "blu_radios": [
        {
          "radio": 1,
          "poll_interval": 10000
        },
        {
          "radio": 2,
          "poll_interval": 10000
        },
        {
          "radio": 3,
          "poll_interval": 10000
        },
        {
          "radio": 4,
          "poll_interval": 10000
        }
      ]
    }
  ]
}
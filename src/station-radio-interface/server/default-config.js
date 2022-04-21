export default {
    radios: [{
        channel: 1,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.2:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    },{
        channel: 2,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.1:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    },{
        channel: 3,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.2:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    },{
        channel: 4,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.3:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    },{
        channel: 5,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.4:1.0",
        config: [
            "preset:fsktag"
        ],
        record: true
    },{
        channel: 6,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.4.4:1.0",
        config: [
          "preset:fsktag"
        ],
        record: true
      },{
        channel: 7,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.4.3:1.0",
        config: [
          "preset:fsktag"
        ],
        record: true
      },{
        channel: 8,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.4.2:1.0",
        config: [
          "preset:fsktag"
        ],
        record: true
      },{
        channel: 9,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.4.1:1.0",
        config: [
          "preset:fsktag"
        ],
        record: true
      },{
        channel: 10,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.1:1.0",
        config: [
          "preset:fsktag"
        ],
        record: true
      },{
        channel: 11,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.3:1.0",
        config: [
          "preset:fsktag"
        ],
        record: true
      },{
        channel: 12,
        path: "/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.4:1.0",
        config: [
          "preset:fsktag"
        ],
        record: true
    }],
    http: {
        websocket_port: 8001,
        flush_websocket_messages_seconds: 1
    },
    record: {
        enabled: true,
        alive_frequency_seconds: 60*10,
        date_format: "YYYY-MM-DD HH:mm:ss",
        flush_data_cache_seconds: 5,
        checkin_frequency_minutes: 60*6,
        sensor_data_frequency_minutes: 60,
        rotation_frequency_minutes: 60,
        base_log_directory: "/data",
        mobile: false
    },
    led: {
        toggle_frequency_seconds: 1
    },
    gps: {
        enabled: true,
        record: true,
        seconds_between_fixes: 60*15
    }
};
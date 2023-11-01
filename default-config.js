{"config_filepath":"/etc/ctt/station-config.json","radio_map_filepath":"/etc/ctt/radio-map.json","default_config":{"radios":[{"channel":1,"config":["preset:fsktag"],"record":true},{"channel":2,"config":["preset:fsktag"],"record":true},{"channel":3,"config":["preset:fsktag"],"record":true},{"channel":4,"config":["preset:fsktag"],"record":true},{"channel":5,"config":["preset:fsktag"],"record":true},{"channel":6,"config":["preset:fsktag"],"record":true},{"channel":7,"config":["preset:fsktag"],"record":true},{"channel":8,"config":["preset:fsktag"],"record":true},{"channel":9,"config":["preset:fsktag"],"record":true},{"channel":10,"config":["preset:fsktag"],"record":true},{"channel":11,"config":["preset:fsktag"],"record":true},{"channel":12,"config":["preset:fsktag"],"record":true}],"http":{"websocket_port":8001,"flush_websocket_messages_seconds":1},"record":{"enabled":true,"alive_frequency_seconds":600,"date_format":"YYYY-MM-DD HH:mm:ss","flush_data_cache_seconds":5,"checkin_frequency_minutes":360,"sensor_data_frequency_minutes":60,"rotation_frequency_minutes":60,"base_log_directory":"/data","mobile":false},"upload":{"ctt":true,"sensorgnome":true},"led":{"toggle_frequency_seconds":1},"gps":{"enabled":true,"record":true,"seconds_between_fixes":900},"blu_radios":{"1":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":10000,"warn_min":{"value":30000,"description":"You may lose detections at this poll interval."}}},"2":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":10000,"warn_min":{"value":30000,"description":"You may lose detections at this poll interval."}}},"3":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":10000,"warn_min":{"value":30000,"description":"You may lose detections at this poll interval."}}},"4":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":700,"warn_min":{"value":30000,"description":"You may lose detections at this poll interval."}}}}},"data":{"radios":[{"channel":1,"config":[null],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.2:1.0"},{"channel":2,"config":["preset:fsktag"],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.3:1.0"},{"channel":3,"config":["preset:fsktag"],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.4:1.0"},{"channel":4,"config":["preset:fsktag"],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.5:1.0"},{"channel":5,"config":["preset:fsktag"],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.6:1.0"},{"channel":6,"config":["preset:fsktag"],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.7:1.0-port0"},{"channel":7,"config":["preset:fsktag"],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.6:1.0-port0"},{"channel":8,"config":["preset:fsktag"],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.5:1.0-port0"},{"channel":9,"config":["preset:fsktag"],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.4:1.0-port0"},{"channel":10,"config":["preset:fsktag"],"record":true,"path":"/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3:1.0-port0"},{"channel":11,"config":["preset:fsktag"],"record":true},{"channel":12,"config":["preset:fsktag"],"record":true}],"http":{"websocket_port":8001,"flush_websocket_messages_seconds":1},"record":{"enabled":true,"alive_frequency_seconds":600,"date_format":"YYYY-MM-DD HH:mm:ss","flush_data_cache_seconds":5,"checkin_frequency_minutes":360,"sensor_data_frequency_minutes":60,"rotation_frequency_minutes":60,"base_log_directory":"/data","mobile":false},"upload":{"ctt":true,"sensorgnome":true},"led":{"toggle_frequency_seconds":1},"gps":{"enabled":true,"record":true,"seconds_between_fixes":900},"blu_radios":{"radio_1":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":10000,"warn_min":{"value":30000,"description":"You may lose detections at this poll interval"}}},"radio_2":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":10000,"warn_min":{"value":60000,"description":"You may lose detections at this poll interval"}}},"radio_3":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":10000,"warn_min":{"value":60000,"description":"You may lose detections at this poll interval"}}},"radio_4":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":10000,"warn_min":{"value":60000,"description":"You may lose detections at this poll interval"}}},"radio_5":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":10000,"warn_min":{"value":60000,"description":"You may lose detections at this poll interval"}}},"radio_6":{"name":"polling_interval","enabled":true,"record":true,"description":"duration","type":"integer","required":false,"display_name":"Polling Interval","units":"ms","values":{"min":1000,"max":30000,"default":10000,"current":10000,"warn_min":{"value":60000,"description":"You may lose detections at this poll interval"}}}}}}
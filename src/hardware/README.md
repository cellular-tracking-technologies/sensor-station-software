# hardware

Higher-level Node.js helpers for the Raspberry Pi host and a few attached
devices, consumed in-process by the station services.

> **Most low-level device I/O now lives elsewhere.** Shared-bus (I2C) access and
> hardware bring-up moved into the native C++ layer (the `ctthw` library and the
> `ctt-*` daemons; see [`native/`](../../native/)) and the OS configuration
> ([`system/`](../../system/)). The Node services read the resulting `/run/ctt/*`
> files and the hardware HTTP API ([`station-hardware-server/`](../station-hardware-server/))
> instead of touching the chips directly. What remains in this folder is the glue
> still used from Node.

## Layout

```
hardware/
├── ctt/                 CTT radio-receiver drivers
│   ├── atmega32u4_receiver.js   ATmega32U4 receiver framing
│   ├── messages.js              receiver message definitions
│   └── bluseries-receiver/      BluSeries (FTDI) receiver: driver, manager, DFU firmware update
├── pi/                  Raspberry Pi host helpers
│   ├── os.js            OS / release info + host commands
│   ├── cron.js          cron management
│   ├── gpio-map.js      board-version → GPIO pin map (V2 / V3)
│   ├── station_id.js    station identity helpers
│   ├── network/         NetworkManager / modem / wifi wrappers, connectivity probe, modem cache
│   └── index.js
├── led-driver/
│   └── v2-driver.js     V2 status LEDs over GPIO (used by the `/led` route)
└── usb.js               USB peripheral / topology helpers (used by the peripherals route)
```

## Notes

- **V3 status LEDs** are driven by the native `ctt-leds` daemon, not from here;
  `led-driver/v2-driver.js` remains for V2 boards' GPIO LEDs.
- **Retired from this folder** (now native): the raw I2C wrapper, the SX1509B
  I/O expander, the board-ID chip readers, the ADC + temperature sensor drivers,
  and the boot-time `initialize.js`. Board identity (`/etc/ctt/station-*` +
  `/run/ctt/board.env`) and sensor readings (`/run/ctt/sensors.json`) are now
  produced by `ctt-board-detect` and `ctt-sensors`.

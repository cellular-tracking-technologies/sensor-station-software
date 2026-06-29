# usb-storage-driver

Detect, mount, unmount, and copy files to/from a removable USB drive. The station
uses it for field operations that move data on and off the unit — exporting logged
data to a stick, or importing an update/config payload from one.

The driver shells out to standard Linux tools (`lsblk`, `mount`, `umount`) and to
the [`ncp`](https://www.npmjs.com/package/ncp) recursive-copy library. It assumes
it runs with sufficient privileges to mount block devices.

## Layout

```
usb-storage-driver/
├── index.js          re-exports UsbStorage (package entry point)
├── usb-storage.js    UsbStorage — the high-level API
├── usb-scanner.js    UsbScanner — finds the first USB block device via lsblk
├── mount-usb.js      MountUsb — mount / unmount / clean the mount point
└── test/index.js     manual exercise of the driver
```

## API

```js
import { UsbStorage } from './usb-storage-driver/index.js'

const usb = new UsbStorage('/mnt/usb')   // mount point (default: /mnt/usb)

await usb.mount()                        // find + mount the first USB drive
usb.copyTo('/data/rotated', /\.csv$/, (err) => { /* ... */ })
usb.copyFrom('export', '/data/import', (err) => { /* ... */ })
await usb.unmount()                      // unmount + remove the mount dir
```

### `UsbStorage`

| Method | Description |
|--------|-------------|
| `mount()` | Unmounts anything stale at the mount point, scans for a USB drive, and mounts the first one found. Throws if no USB device is detected. |
| `unmount()` | Unmounts the drive and removes the mount directory. |
| `copyTo(src, pattern, callback)` | Recursively copy `src` onto the mounted drive; `pattern` is an `ncp` filter (regex or function). |
| `copyFrom(src, dest, callback)` | Recursively copy `src` (relative to the mount point) to `dest` on local disk. |

### `UsbScanner`

Runs `lsblk -O --json` and filters block devices whose transport (`tran`) is
`usb`. `retriveUsb()` returns the first detected USB drive's first partition
(falling back to the bare block device when there are no partitions), including
its `path`, `size`, `model`, and `fstype`.

### `MountUsb`

Wraps `mount <device> <dir>` / `umount <dir>` and a `clean()` step that removes
the mount directory. Creates the mount directory on demand. All shell commands
run through the shared `src/command.js` exec wrapper.

## Behavior notes

- Only the **first** USB device reported by `lsblk` is used.
- `mount()` clears the mount point before mounting, so a leftover mount from a
  prior run does not block a fresh insert.
- Copy operations are callback-based (delegated to `ncp`), not promise-based.

## Dependencies

- [`ncp`](https://www.npmjs.com/package/ncp) — recursive file copy.
- System tools: `lsblk`, `mount`, `umount`.

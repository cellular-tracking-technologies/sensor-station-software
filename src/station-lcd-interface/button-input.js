import fs from 'fs'

// Front-panel buttons are standard Linux input (evdev) devices created by the
// kernel gpio-keys driver (the board's gpio-key overlays are part of the
// canonical /boot/config.txt applied by ctt-device-config — see
// system/device-tree/). The kernel owns edge
// detection and debounce; this module just consumes key-press events and maps
// them to menu actions — no GPIO library, no debounce code.
//
// Each button is its own gpio-key instance: the kernel names the input device
// "button@<gpio>" with Phys "gpio-keys/inputN" (the overlay `label=` is the key
// label, not the device name). We find those event devices and read KEY_*
// presses from each.

// keycode -> menu action. Up=KEY_UP, Down=KEY_DOWN, Select=KEY_ENTER, Back=KEY_ESC.
const KEYCODE = { 103: 'up', 108: 'down', 28: 'select', 1: 'back' }

const EV_KEY = 0x01
const KEY_PRESS = 1 // value: 1 = press, 0 = release, 2 = autorepeat

// input_event layout on a 32-bit kernel (armhf): struct timeval (2x32-bit = 8
// bytes) + __u16 type + __u16 code + __s32 value = 16 bytes. On a 64-bit kernel
// this would be 24 bytes — revisit if the fleet moves to arm64.
const EVENT_SIZE = 16

// Resolve the /dev/input/eventN paths for the gpio-keys button devices. They
// report Phys "gpio-keys/inputN" and names like "button@<gpio>"; either
// identifies them. Key presses are still gated by the KEYCODE map below, so a
// stray non-button device matched here would simply never fire an action.
function findButtonDevices() {
  let txt
  try {
    txt = fs.readFileSync('/proc/bus/input/devices', 'utf8')
  } catch (err) {
    return []
  }
  const paths = []
  for (const block of txt.split('\n\n')) {
    const phys = (block.match(/^P: Phys=(.*)$/m) || [])[1] || ''
    const name = (block.match(/^N: Name="([^"]*)"/m) || [])[1] || ''
    if (!phys.includes('gpio-keys') && !name.startsWith('button@')) {
      continue
    }
    const handlers = (block.match(/^H: Handlers=(.*)$/m) || [])[1] || ''
    const ev = (handlers.match(/\bevent\d+\b/) || [])[0]
    if (ev) {
      paths.push(`/dev/input/${ev}`)
    }
  }
  return paths
}

/**
 * Watch the front-panel button input devices and invoke menu actions on press.
 * @param {{up:Function, down:Function, select:Function, back:Function}} handlers
 * @param {{retries:number, retryMs:number}} [opts] retry finding devices (they
 *        may not exist until the gpio-keys overlay has been applied + booted).
 */
export function watchButtons(handlers, { retries = 15, retryMs = 2000 } = {}) {
  const paths = findButtonDevices()
  if (paths.length === 0) {
    if (retries > 0) {
      setTimeout(() => watchButtons(handlers, { retries: retries - 1, retryMs }), retryMs)
    } else {
      console.error('button-input: no gpio-keys button devices found (overlay applied + booted?)')
    }
    return
  }

  for (const path of paths) {
    let buf = Buffer.alloc(0)
    const stream = fs.createReadStream(path)
    stream.on('data', chunk => {
      buf = Buffer.concat([buf, chunk])
      while (buf.length >= EVENT_SIZE) {
        const ev = buf.subarray(0, EVENT_SIZE)
        buf = buf.subarray(EVENT_SIZE)
        const type = ev.readUInt16LE(8)
        const code = ev.readUInt16LE(10)
        const value = ev.readInt32LE(12)
        if (type === EV_KEY && value === KEY_PRESS) {
          const action = KEYCODE[code]
          if (action && typeof handlers[action] === 'function') {
            handlers[action]()
          }
        }
      }
    })
    stream.on('error', err => console.error(`button-input: ${path}: ${err.message}`))
    console.log(`button-input: watching ${path} (gpio-keys)`)
  }
}

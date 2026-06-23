import { exec } from 'child_process'

// Watches the station-radio-interface service and surfaces a front-panel warning
// when it is not running. Radio acquisition dying is otherwise only visible on a
// status LED, which is easy to miss; this puts it on the LCD as well.
//
// Detection is done through systemd (the authoritative view of the unit) rather
// than an in-process signal: a service can die by uncaught exception, OOM-kill,
// or SIGKILL, none of which deliver a catchable signal to the dying process, and
// a separate process cannot paint this process's framebuffer anyway. Polling
// `systemctl is-active` catches every one of those failure modes.
//
// The LCD interface owns every write to /run/ctt/lcd, so the warning is re-
// asserted on each poll while the unit is down; that way it reappears within one
// interval if the menu repaints over it (button press or an auto-refresh view).
// An unchanged repaint diffs to nothing in the ctt-lcd daemon, so it does not
// flicker.

const UNIT = 'station-radio-interface.service'
const POLL_MS = 5000

// Resolve true when the unit is up (active, or mid-(re)start), false otherwise.
// Treat activating/reloading as up so a normal restart does not flash a warning.
function isUp() {
  return new Promise((resolve) => {
    exec(`systemctl is-active ${UNIT}`, { timeout: 4000 }, (err, stdout) => {
      const state = String(stdout).trim()
      resolve(state === 'active' || state === 'activating' || state === 'reloading')
    })
  })
}

/**
 * Poll the radio-interface unit. While it is down, onDown() is called every tick
 * so the warning stays asserted on the panel. When it comes back, onUp() fires
 * once on the down->up edge so the caller can restore the normal display.
 * @param {Object} cbs
 * @param {function():void} cbs.onDown - paint/refresh the warning.
 * @param {function():void} cbs.onUp   - restore the normal display (one-shot).
 * @param {number} [cbs.pollMs]
 * @return {function():void} stop function.
 */
export function watchRadioInterface({ onDown, onUp, pollMs = POLL_MS } = {}) {
  let wasUp = true
  const tick = async () => {
    const up = await isUp()
    if (!up) {
      if (onDown) onDown()
    } else if (!wasUp) {
      if (onUp) onUp()
    }
    wasUp = up
  }
  tick()
  const timer = setInterval(tick, pollMs)
  if (timer.unref) timer.unref()
  return () => clearInterval(timer)
}

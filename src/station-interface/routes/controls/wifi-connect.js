// POST /wifi/connect — join a WiFi network with an SSID + password entered in the
// dashboard (behind auth). Mirrors what /usb/wifi does from a USB credentials
// file, but takes the values from the request body.
//
// SECURITY: use execFile with an argv array, NOT the shell-based RunCommand
// (src/command.js uses exec()). The SSID/password are untrusted operator input,
// so they must never be interpolated into a shell string — execFile passes them
// as literal argv to nmcli, so a name/password containing spaces or shell
// metacharacters can't inject a command.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const pExecFile = promisify(execFile)

export default async (req, res) => {
  const ssid = (req.body?.ssid ?? '').toString().trim()
  const psk = (req.body?.psk ?? '').toString() // empty allowed (open network)

  if (!ssid) {
    return res.status(400).json({ error: 'ssid required' })
  }

  try {
    // `nmcli dev wifi connect <ssid> [password <psk>]` creates the connection
    // profile (named after the SSID) and activates it. Requires WiFi to be
    // enabled first (the enable-wifi driver load); if it isn't, nmcli reports no
    // wifi device and we surface that error rather than hanging.
    const args = ['dev', 'wifi', 'connect', ssid]
    if (psk) args.push('password', psk)
    await pExecFile('nmcli', args, { timeout: 45000 })

    // New wifi profiles default to DHCP, but set it explicitly to be safe.
    await pExecFile('nmcli', ['connection', 'modify', ssid, 'ipv4.method', 'auto'], { timeout: 10000 })

    return res.status(200).json({ ok: true, ssid })
  } catch (err) {
    const detail = (err?.stderr || err?.message || '').toString().trim()
    console.log('wifi connect failed for SSID', JSON.stringify(ssid), '-', detail)
    // Don't echo the password back; only the nmcli error text.
    return res.status(500).json({ error: 'connect failed', detail: detail.slice(0, 300) })
  }
}

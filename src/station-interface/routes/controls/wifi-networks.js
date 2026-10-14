// GET /wifi/networks — proxy the hardware-server WiFi scan for the dashboard's
// "Scan for networks" dropdown. Returns the array of visible networks
// ({ ssid, signal, ... }); the client dedupes + sorts by signal.
export default async (req, res) => {
  try {
    const response = await fetch('http://localhost:3000/internet/wifi-scan')
    if (!response.ok) throw new Error(`hardware-server ${response.status}`)
    res.json(await response.json())
  } catch (err) {
    console.error('wifi scan proxy failed', err)
    res.sendStatus(500)
  }
}

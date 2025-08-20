export default async (req, res) => {
  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/enable-wifi.sh')
  return res.status(200).send()
}
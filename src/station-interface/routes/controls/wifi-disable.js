import RunCommand from '../../../command.js'

export default async (req, res) => {
  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/disable-wifi.sh')
  return res.status(200).send()
}
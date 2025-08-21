import RunCommand from '../../../../command.js'

export default async (req, res) => {
  await RunCommand('rm -rf /data/SGdata/*')
  await RunCommand('systemctl restart sensorgnome')
  res.json({ res: true })
}
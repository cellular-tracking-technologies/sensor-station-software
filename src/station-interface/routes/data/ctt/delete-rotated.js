import RunCommand from '../../../../command.js'

export default async (req, res) => {
  await RunCommand('rm -rf /data/rotated')
  await RunCommand('mkdir /data/rotated')
  res.json({ res: true })
}
import RunCommand from '../../../../command.js'

export default async (req, res) => {
  await RunCommand('rm -rf /data/uploaded/sg')
  res.json({ res: true })
}
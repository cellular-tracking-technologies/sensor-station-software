import RunCommand from '../../../../command.js'

export default async (req, res) => {
  await RunCommand('rm -rf /data/uploaded/ctt')
  res.json({ res: true })
}
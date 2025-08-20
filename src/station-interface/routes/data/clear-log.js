import fs from 'fs'

export default async (req, res) => {
  const log_file = await glob('/data/CTT-*-log.csv')
  console.log('log file', log_file)
  if (fs.existsSync(log_file[0])) {
    fs.unlinkSync(log_file[0])
    res.send(JSON.stringify({ res: true }))
    return
  }
  res.send(JSON.stringify({ res: false }))
}

import { spawn } from 'child_process'

export default (req, res) => {
  const cmd = spawn('systemctl', ['restart', 'station-radio-interface'])
  console.log('issuing radio restart')
  cmd.on('error', (err) => {
    console.error(err)
    res.sendStatus(500)
  })
  cmd.stdout.on('data', (data) => {
    console.log(data.toString())
  })
  cmd.on('close', () => {
    res.sendStatus(204)
  })
}
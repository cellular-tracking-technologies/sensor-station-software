import { spawn } from 'child_process'

export default (req, res) => {
  const reboot = spawn('shutdown', ['-r', 'now'])
  reboot.stdout.on('data', (data) => {
    console.log('data', data.toString())
  })
  reboot.stderr.on('data', (data) => {
    console.log('err', data.toString())
  })
  res.send('rebooting')
}
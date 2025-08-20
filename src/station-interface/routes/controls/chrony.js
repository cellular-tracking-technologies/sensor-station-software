import { spawn } from 'child_process'

export default (req, res) => {
  const cmd = spawn('chronyc', ['sources', '-v'])
  let buffer = ''
  cmd.stdout.on('data', (data) => {
    buffer += data.toString()
  })
  cmd.on('close', () => {
    res.send(buffer)
  })
}
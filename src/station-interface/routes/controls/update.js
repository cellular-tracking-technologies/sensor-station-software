import { spawn } from 'child_process'
import fs from 'fs'

export default (req, res) => {
  const contents = req.body.toString()
  fs.writeFile('/tmp/update.sh', contents, (err) => {
    if (err) {
      res.send('error writing update file')
      return
    } else {
      const cmd = spawn('/bin/bash', ['/tmp/update.sh'])
      cmd.on('error', (err) => {
        console.error(err)
      })
      cmd.stdout.on('data', (data) => {
        console.log(data)
      })
      cmd.stderr.on('data', (data) => {
        console.log('error', data)
      })

      cmd.on('close', () => {
        res.send('updating')
      })
    }
  })
}
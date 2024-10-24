import { exec } from 'child_process'

export default async (cmd) => {
  console.log('executing command', cmd)
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.log(`command error ${cmd}; ${stderr}`)
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}
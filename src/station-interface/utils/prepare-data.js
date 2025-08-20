import fs from 'fs'
import archiver from 'archiver'

import Files from '../utils/files.js'

export default (filelist) => {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(Files.Temp)) {
      fs.unlinkSync(Files.Temp)
    }
    let output = fs.createWriteStream(Files.Temp)
    output.on('close', () => {
      resolve(true)
    })
    output.on('error', (err) => {
      reject(err)
    })
    const archive = archiver('zip', {
      zlip: { level: 9 }
    })
    archive.on('error', (err) => {
      reject(err)
    })
    archive.pipe(output)
    filelist.forEach((filename) => {
      archive.file(filename, { name: filename })
    })
    archive.finalize()
  })
}
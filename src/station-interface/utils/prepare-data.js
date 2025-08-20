import fs from 'fs'
import archiver from 'archiver'

export default (filelist) => {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(TMP_FILE)) {
      fs.unlinkSync(TMP_FILE)
    }
    let output = fs.createWriteStream(TMP_FILE)
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
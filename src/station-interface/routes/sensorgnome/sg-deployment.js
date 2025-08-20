import fs from 'fs'
import Files from '../../utils/files.js'

export default (req, res, next) => {
  fs.readFile(Files.Deployment, (err, contents) => {
    if (err) {
      next(err)
    } else {
      res.send(contents)
    }
  })
}
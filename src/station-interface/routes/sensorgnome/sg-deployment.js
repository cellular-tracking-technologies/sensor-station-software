import fs from 'fs'
import SensorgnomeFiles from './files.js'

export default (req, res, next) => {
  fs.readFile(SensorgnomeFiles.Deployment, (err, contents) => {
    if (err) {
      next(err)
    } else {
      res.send(contents)
    }
  })
}
import fs from 'fs'
import SensorgnomeFiles from './files.js'

export default (req, res, next) => {
  fs.writeFile(SensorgnomeFiles.Deployment, req.body.contents, (err) => {
    if (err) {
      next(err)
    } else {
      console.log('saved data')
      res.json({ res: true })
    }
  })
}
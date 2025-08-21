import fs from 'fs'
import Files from '../../utils/files.js'

export default (req, res, next) => {
  fs.writeFile(Files.Sensorgnome.Deployment, req.body.contents, (err) => {
    if (err) {
      next(err)
    } else {
      console.log('saved data')
      res.json({ res: true })
    }
  })
}
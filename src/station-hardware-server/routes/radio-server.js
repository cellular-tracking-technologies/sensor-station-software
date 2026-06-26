import fs from 'fs'
import express from 'express'

const router = express.Router()
const ConfigFileURI = '/etc/ctt/station-config.json'

router.get('/config', (req, res, next) => {
  try {
    let config = JSON.parse(fs.readFileSync(ConfigFileURI).toString())
    res.json(config)
  } catch (err) {
    res.json({ err: err.toString() })
  }
})

export default router
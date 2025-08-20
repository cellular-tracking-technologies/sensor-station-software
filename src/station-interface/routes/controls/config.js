import fs from 'fs'

const ConfigFileURI = '/etc/ctt/station-config.json'

export default (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(ConfigFileURI).toString())
    res.json(config)
  } catch (err) {
    res.json({ err: err.toString() })
  }
}
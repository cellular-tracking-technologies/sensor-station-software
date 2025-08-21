import RunCommand from '../../../command.js'

const BASE_SG_TAG_DB_NAME = 'SG_tag_database'

export default (req, res, next) => {
  console.log('tag database upload')
  const ext = req.get('file-extension')
  const filename = `${BASE_SG_TAG_DB_NAME}.${ext}`
  console.log('about to delete sg tag db files')
  RunCommand(`rm /data/sg_files/${BASE_SG_TAG_DB_NAME}*`)
    .then(() => {
      let uri = `/data/sg_files/${filename}`
      console.log('writing tag database file')
      fs.writeFileSync(uri, req.body)
      res.json({ res: true })
    }).catch((err) => {
      console.log('something went wrong handling new SG tag database file')
      console.error(err)
    })
}
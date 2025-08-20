import { glob } from 'glob'
import prepareData from '../../../utils/prepare-data.js'
import Files from '../../../utils/files.js'

export default async (req, res, next) => {
  const filelist = await glob('/data/*.csv')
  if (filelist.length < 1) {
    res.send('No data available')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    const download_name = `ctt-data.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(Files.Temp, download_name)
  }).catch((err) => {
    next(err)
  })
}
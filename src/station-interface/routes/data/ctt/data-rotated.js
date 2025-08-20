import { glob } from 'glob'
import moment from 'moment'

import prepareData from "../../../utils/prepare-data.js"
import Files from '../../../utils/files.js'

export default async (req, res, next) => {
  const filelist = await glob('/data/rotated/*.gz')
  if (filelist.length < 1) {
    res.send('Nothing to download yet')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    const download_name = `ctt-data-rotated.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(Files.Temp, download_name)
  }).catch((err) => {
    res.send('ERROR processing download request ' + err)
  })
}
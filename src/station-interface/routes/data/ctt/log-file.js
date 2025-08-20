import { glob } from 'glob'
import moment from 'moment'

import prepareData from '../../../utils/prepare-data.js'
import Files from '../../../utils/files.js'

export default async (req, res, next) => {
  const filelist = await glob('/data/CTT-*-log.csv')
  if (filelist.length < 1) {
    res.send('no log file to send')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    const download_name = `ctt-log.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(Files.Temp, download_name)
  }).catch((err) => {
    res.send('error preparing ctt log files ' + err)
  })
}
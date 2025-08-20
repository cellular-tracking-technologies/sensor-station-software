import prepareData from '../../../utils/prepare-data.js'

export default async (req, res, next) => {
  const filelist = await glob('/data/*.csv')
  if (filelist.length < 1) {
    res.send('No data available')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    const download_name = `ctt-data.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(TMP_FILE, download_name)
  }).catch((err) => {
    next(err)
  })
}
import prepareData from "../../../utils/prepare-data.js"

export default async (req, res, next) => {
  const filelist = await glob('/data/rotated/*.gz')
  if (filelist.length < 1) {
    res.send('Nothing to download yet')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    const download_name = `ctt-data-rotated.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(TMP_FILE, download_name)
  }).catch((err) => {
    res.send('ERROR processing download request ' + err)
  })
}
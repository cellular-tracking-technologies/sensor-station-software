import express from 'express'
import { glob } from 'glob'
import fs from 'fs'
import moment from 'moment'
import { spawn } from 'child_process'
import archiver from 'archiver'
import bodyParser from 'body-parser'
import fetch from 'node-fetch'
import RunCommand from '../../command.js'

const TMP_FILE = '/tmp/download.zip'
const SG_DEPLOYMENT_FILE = '/data/sg_files/deployment.txt'
const LOG_FILE = '/data/sensor-station.log'
const ConfigFileURI = '/etc/ctt/station-config.json'

const router = express.Router()

router.get('/', function (req, res, next) {
  res.render('main', { title: 'CTT Sensor Station', message: 'pug' })
})

router.get('/blu', function (req, res) {
  res.render('main-blu', { title: 'CTT Blu Receiver Interface', message: 'pug' })
})

router.get('/update-station', function (req, res, next) {
  res.render('station-update')
})

router.get('/crash', (req, res, next) => {
  // crash - bad variable
  throw (Error('throwing crash error'))
})

router.get('/sg-deployment', (req, res, next) => {
  fs.readFile(SG_DEPLOYMENT_FILE, (err, contents) => {
    if (err) {
      next(err)
    } else {
      res.send(contents)
    }
  })
})

router.post('/save-sg-deployment', (req, res, next) => {
  fs.writeFile(SG_DEPLOYMENT_FILE, req.body.contents, (err) => {
    if (err) {
      next(err)
    } else {
      console.log('saved data')
      res.json({ res: true })
    }
  })
})

const BASE_SG_TAG_DB_NAME = 'SG_tag_database'
router.post('/upload-sg-tag-file', (req, res) => {
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
})

const prepareData = (filelist) => {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(TMP_FILE)) {
      fs.unlinkSync(TMP_FILE)
    }
    let output = fs.createWriteStream(TMP_FILE)
    output.on('close', () => {
      resolve(true)
    })
    output.on('error', (err) => {
      reject(err)
    })
    var archive = archiver('zip', {
      zlip: { level: 9 }
    })
    archive.on('error', (err) => {
      reject(err)
    })
    archive.pipe(output)
    filelist.forEach((filename) => {
      archive.file(filename, { name: filename })
    })
    archive.finalize()
  })
}

router.get('/ctt-data-current', async (req, res, next) => {
  // glob('/data/*.csv', (err, filelist) => {
  let filelist = await glob('/data/*.csv')
  if (filelist.length < 1) {
    res.send('No data available')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    let download_name = `ctt-data.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(TMP_FILE, download_name)
  }).catch((err) => {
    next(err)
  })
  // })
})

router.get('/ctt-logfile', async (req, res, next) => {
  let filelist = await glob('/data/CTT-*-log.csv')
  console.log('ctt logfile await', filelist)
  // glob('/data/CTT-*-log.csv', (err, filelist) => {
  if (filelist.length < 1) {
    res.send('no log file to send')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    let download_name = `ctt-log.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(TMP_FILE, download_name)
  }).catch((err) => {
    res.send('error preparing ctt log files ' + err)
  })
  // })
})

router.get('/sg-data-rotated', async (req, res, next) => {
  let filelist = await glob('/data/SGdata/*/*.gz')
  // glob('/data/SGdata/*/*.gz', (err, filelist) => {
  if (filelist.length < 1) {
    res.send('Nothing to download yet')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    let download_name = `sg-data-uploaded.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(TMP_FILE, download_name)
  }).catch((err) => {
    res.send('ERROR processing download request ' + err)
  })
  // })
})

router.get('/sg-data-uploaded', async (req, res, next) => {
  let filelist = await glob('/data/uploaded/sg/*/*.gz')
  // glob('/data/uploaded/sg/*/*.gz', (err, filelist) => {
  if (filelist.length < 1) {
    res.send('Nothing to download yet')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    let download_name = `sg-data-uploaded.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(TMP_FILE, download_name)
  }).catch((err) => {
    res.send('ERROR processing download request ' + err)
  })
  // })
})

router.get('/ctt-data-rotated', async (req, res, next) => {
  // glob('/data/rotated/*.gz', (err, filelist) => {
  let filelist = await glob('/data/rotated/*.gz')
  if (filelist.length < 1) {
    res.send('Nothing to download yet')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    let download_name = `ctt-data-rotated.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(TMP_FILE, download_name)
  }).catch((err) => {
    res.send('ERROR processing download request ' + err)
  })
  // })
})

router.get('/ctt-data-uploaded', async (req, res, next) => {
  // glob('/data/uploaded/ctt/*/*.gz', (err, filelist) => {
  let filelist = await glob('/data/uploaded/ctt/*/*.gz')
  if (filelist.length < 1) {
    res.send('Nothing to download yet')
    return
  }
  prepareData(filelist).then((prepare_result) => {
    let download_name = `ctt-data-uploaded.${moment(new Date()).format('YYYY-MM-DD_HHMMSS')}.zip`
    res.download(TMP_FILE, download_name)
  }).catch((err) => {
    res.send('ERROR processing download request ' + err)
  })
  // })
})

router.post('/delete-ctt-data-uploaded', async (req, res) => {
  await RunCommand('rm -rf /data/uploaded/ctt')
  res.json({ res: true })
})

router.post('/delete-ctt-data-rotated', async (req, res) => {
  await RunCommand('rm -rf /data/rotated')
  await RunCommand('mkdir /data/rotated')
  res.json({ res: true })
})

router.post('/delete-sg-data-uploaded', async (req, res) => {
  await RunCommand('rm -rf /data/uploaded/sg')
  res.json({ res: true })
})

router.post('/delete-sg-data-rotated', async (req, res) => {
  await RunCommand('rm -rf /data/SGdata/*')
  await RunCommand('systemctl restart sensorgnome')
  res.json({ res: true })
})

router.post('/clear-log/', async (req, res, next) => {
  // let log_file = '/data/sensor-station.log'
  let log_file = await glob('/data/CTT-*-log.csv')
  console.log('log file', log_file)
  if (fs.existsSync(log_file[0])) {
    fs.unlinkSync(log_file[0])
    res.send(JSON.stringify({ res: true }))
    return
  }
  res.send(JSON.stringify({ res: false }))
})

router.get('/chrony', (req, res, next) => {
  const cmd = spawn('chronyc', ['sources', '-v'])
  let buffer = ''
  cmd.stdout.on('data', (data) => {
    buffer += data.toString()
  })
  cmd.on('close', () => {
    res.send(buffer)
  })
})

router.post('/reboot', (req, res, next) => {
  const reboot = spawn('shutdown', ['-r', 'now'])
  reboot.stdout.on('data', (data) => {
    console.log('data', data.toString())
  })
  reboot.stderr.on('data', (data) => {
    console.log('err', data.toString())
  })
  res.send('rebooting')
})

router.get('/update', (req, res, next) => {
  res.render('update', { title: 'CTT Sensor Station Update', message: 'pug' })
})

router.use(bodyParser.raw({
  limit: '50mb'
}))

router.post('/update', (req, res, next) => {
  let contents = req.body.toString()
  fs.writeFile('/tmp/update.sh', contents, (err) => {
    if (err) {
      res.send('error writing update file')
      return
    } else {
      const cmd = spawn('/bin/bash', ['/tmp/update.sh'])
      cmd.on('error', (err) => {
        console.error(err)
      })
      cmd.stdout.on('data', (data) => {
        console.log(data)
      })
      cmd.stderr.on('data', (data) => {
        console.log('error', data)
      })

      cmd.on('close', () => {
        res.send('updating')
      })
    }
  })
})

router.get('/config', (req, res, next) => {
  try {
    let config = JSON.parse(fs.readFileSync(ConfigFileURI).toString())
    res.json(config)
  } catch (err) {
    res.json({ err: err.toString() })
  }
})

router.post('/radio-restart', (req, res) => {
  const cmd = spawn('systemctl', ['restart', 'station-radio-interface'])
  console.log('issuing radio restart')
  cmd.on('error', (err) => {
    console.error(err)
    res.sendStatus(500)
  })
  cmd.stdout.on('data', (data) => {
    console.log(data.toString())
  })
  cmd.on('close', () => {
    res.sendStatus(204)
  })
})

/**
 * 
 * get software versions from package.json data
 */
router.get('/software', (req, res) => {
  fetch('http://localhost:3000/node/version')
    .then(res => res.json())
    .then((json) => {
      res.json(json)
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500)
    })
})

/**
 * proxy to hardware server to get internet gateway
 */
router.get('/internet-gateway', (req, res) => {
  fetch('http://localhost:3000/internet/gateway')
    .then(res => res.json())
    .then((json) => {
      res.json(json)
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500)
    })
})

/**
 * proxy to hardware server to get internet gateway
 */
router.get('/internet-wifi-strength', (req, res) => {
  // fetch('http://localhost:3000/internet/wifi-strength')
  fetch('http://localhost:3000/internet/wifi-networks')

    .then(res => res.json())
    .then((json) => {
      res.json(json)
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500)
    })
})

/**
 * get reboot schedule from crontab via hardware server proxy
 */
router.get('/reboot-schedule', (req, res) => {
  fetch('http://localhost:3000/control/reboot-schedule')
    .then(res => res.json())
    .then((json) => {
      res.json(json)
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500)
    })
})

/**
 * update reboot scheule via hardware server proxy
 */
router.post('/update-reboot-schedule', (req, res) => {
  console.log('rx', req.body)
  fetch('http://localhost:3000/control/update-reboot-schedule', {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  })
    .then((proxy_response) => {
      if (proxy_response.ok) {
        res.sendStatus(204)
      } else {
        res.sendStatus(proxy_response.status)
      }
    })
    .catch((err) => {
      console.error('error with reboot schedule  proxy post')
      console.error(err)
      res.sendStatus(500)
    })
})

router.post('/modem/enable', async (req, res) => {
  await RunCommand('nmcli connection up station-modem')
  return res.status(200).send()
})
router.post('/modem/disable', async (req, res) => {
  await RunCommand('nmcli connection down station-modem')
  return res.status(200).send()
})

router.get('/modem-signal-strength', async (req, res) => {
  fetch('http://localhost:3000/modem/signal-strength')
    .then(res => res.json())
    .then((json) => {
      res.json(json)
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500)
    })
})

router.post('/wifi/enable', async (req, res) => {
  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/enable-wifi.sh')
  return res.status(200).send()
})

router.post('/wifi/disable', async (req, res) => {
  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/disable-wifi.sh')
  return res.status(200).send()
})

export default router

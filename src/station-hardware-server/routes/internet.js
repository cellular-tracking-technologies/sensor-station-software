import { glob } from 'glob'
import express from 'express'
import icmp from 'icmp'
import { exec } from 'child_process'
import Wifi from '../../hardware/pi/network/wifi.js'
import RunCommand from '../../command.js'

const router = express.Router();

const DEFAULT_PING_COUNT = 3;
const PING_IP = '8.8.8.8';

const ping = function () {
  return new Promise((resolve, reject) => {
    icmp.send(PING_IP)
      .then((ping_result) => {
        resolve(ping_result.open);
      })
      .catch((err) => {
        reject(err);
      });
  })
}

/**
 * get default route to the internet
 */
router.get('/gateway', (req, res) => {
  exec("ip route | grep default | awk '{ print $3 }' | xargs", (err, stdout, stderr) => {
    if (err) {
      console.error(err)
      res.sendStatus(500)
      return
    }
    res.send({ gateway: stdout.trim() })
  })
})

router.get('/status', (req, res, next) => {
  console.log('internet status', res)
  let ping_success = 0;
  let ping_loss = 0;
  let ping_count = req.query.ping_count ? req.query.ping_count : DEFAULT_PING_COUNT;
  // issue a ping to the given IP address
  let promises = [];
  for (let i = 0; i < ping_count; i++) {
    promises.push(ping())
  }
  Promise.all(promises)
    .then((results) => {
      results.forEach((result) => {
        result ? ping_success++ : ping_loss++;
      });
      return res.json({
        success: ping_success,
        fail: ping_loss
      });
    })
    .catch((err) => {
      console.log('something went wrong with ping status...');
      console.error(err);
      return res.json({
        success: 0,
        fail: ping_count
      });
    })
});

router.get('/enable-wifi', async (req, res) => {
  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/enable-wifi.sh')

  return res.status(200).send()
})

router.get('/disable-wifi', async (req, res) => {
  await RunCommand('/bin/bash /lib/ctt/sensor-station-software/system/scripts/disable-wifi.sh')
  return res.status(200).send()
})

const getStatsForDir = async (opts) => {
  const { dir } = opts
  const files = await glob(dir, { stat: true, withFileTypes: true })
  const bytes = files.reduce((total, file) => total += file.size, 0)
  return {
    bytes: bytes,
    file_count: files.length
  }
}

const getPendingUploads = async () => {
  const [ctt, sg] = await Promise.all([
    getStatsForDir({ dir: '/data/rotated/*.gz' }),
    getStatsForDir({ dir: '/data/SGdata/*/*.gz' }),
  ])
  return {
    ctt,
    sg,
  }
}

router.get('/pending-upload', async (req, res, next) => {
  try {
    const pending_uploads = await getPendingUploads()
    res.json(pending_uploads)
  } catch (err) {
    console.error('error getting pending uploads')
    console.error(err)
    res.json({
      bytes: -1,
      file_count: -1
    })
  }
})

router.get('/wifi-networks', (req, res, next) => {
  const wifi = Wifi.GetCurrentNetwork()
  if (wifi) {
    res.json(wifi)
  } else {
    res.json({
      signal: undefined,
      state: false,
    })
  }

})

export default router
import fs from 'fs'
import { glob } from 'glob'
import express from 'express'
import icmp from 'icmp'
import { exec } from 'child_process'
import Wifi from '../../hardware/pi/network/wifi.js'

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

const getStatsForDir = (opts) => {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    glob(opts.dir, (err, files) => {
      if (err) {
        // can't read the directory - nothing to send
        resolve({
          bytes: 0,
          filecount: 0
        })
        return;
      }
      files.forEach((file) => {
        try {
          let stats = fs.statSync(file);
          bytes += stats.size;
        } catch (err) {
          reject(err);
        }
      });
      resolve({
        bytes: bytes,
        file_count: files.length
      });
    });
  });
};

const getPendingUploads = () => {
  return new Promise((resolve, reject) => {

    let promises = [
      getStatsForDir({
        delay: 0,
        dir: '/data/rotated/*.gz'
      }),
      getStatsForDir({
        delay: 61 * 60 * 1000,
        dir: '/data/SGdata/*/*.gz',
      })
    ];
    Promise.all(promises)
      .then((results) => {
        resolve({
          ctt: results[0],
          sg: results[1]
        });
      })
      .catch((err) => {
        console.error('something went wrong getting uploads');
        console.error(err);
        reject(err);
      });
  })
};

router.get('/pending-upload', (req, res, next) => {
  getPendingUploads()
    .then((info) => {
      res.json(info);
    })
    .catch((err) => {
      console.error('error getting pending uploads');
      console.error(err);
      res.json({
        bytes: -1,
        file_count: -1
      })
    });
});

router.get('/wifi-networks', (req, res, next) => {
  res.json(Wifi.GetNetworks())
})

export default router
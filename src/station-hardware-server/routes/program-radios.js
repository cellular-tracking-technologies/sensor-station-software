import express from 'express'
import command from '../../command.js'


const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    await command('sudo program-radios /lib/ctt/sensor-station-software/system/radios/fw/ss_v4.0.0.hex')

    return res.status(200).send()

  } catch (e) {
    console.error('could not program radios', e)
    res.send(404)
  }
})

export default router
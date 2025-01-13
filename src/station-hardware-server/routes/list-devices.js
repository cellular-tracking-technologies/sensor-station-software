import express from 'express'
import command from '../../command.js'


const router = express.Router()

router.get('/', async (req, res, next) => {
    try {
        const devices = await command('sudo bash system/scripts/list-devices.sh')
        res.send(devices)

    } catch (e) {
        console.error('could not program radios', e)
        res.send(404)
    }
})

export default router
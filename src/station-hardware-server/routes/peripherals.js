import express from 'express'
import Usb from '../../hardware/usb.js'

const router = express.Router()

router.get('/', function (req, res) {
  res.json(Usb.ListUsb())
})

export default router
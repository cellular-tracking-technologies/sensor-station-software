import fs from 'fs'
import WebSocket from 'ws'
import express from 'express'

const router = express.Router()
const WebSocketURL = 'ws://localhost:8001'
const ConfigFileURI = '/etc/ctt/station-config.json'

router.get('/qaqc', (req, res, next) => {
  let ws = new WebSocket(WebSocketURL)
  ws.on('open', () => {
    ws.send(JSON.stringify({
      msg_type: 'cmd',
      cmd: 'qaqc'
    }))
    res.status(204).send()
    ws.close()
  })
  ws.on('close', () => {
    try {
      res.status(500).send('web socket closed')
    } catch (err) {
      console.log('ws close')
    }
  })
  ws.on('error', (err) => {
    console.error('error connected to radio server web socket')
    console.error(err)
    try {
      res.status(500).send('web socket connect error')
    } catch (err) {
      console.log('ws err')
    }
  })
})

router.get('/checkin', (req, res, next) => {
  let ws = new WebSocket(WebSocketURL)
  ws.on('open', () => {
    ws.send(JSON.stringify({
      msg_type: 'cmd',
      cmd: 'checkin'
    }))
    res.status(204).send()
    ws.close()
  })
  ws.on('close', () => {
    try {
      res.status(500).send('web socket closed')
    } catch (err) {
      console.log('ws checkin close')
    }
  })
  ws.on('error', (err) => {
    console.error('error connected to radio server web socket')
    console.error(err)
    try {
      res.status(500).send('web socket connect error')
    } catch (err) {
      console.log('ws err close')
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

export default router
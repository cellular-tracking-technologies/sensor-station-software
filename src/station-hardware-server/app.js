import express from 'express'
import indexRouter from './routes/index.js'
import modemRouter from './routes/modem.js'
import sensorRouter from './routes/sensor.js'
import usbRouter from './routes/usb.js'
import gpsRouter from './routes/gps.js'
import internetRouter from './routes/internet.js'
import peripheralRouter from './routes/peripherals.js'
import radioRouter from './routes/radio-server.js'
import controlRouter from './routes/control.js'
import revision from '../revision.js'
import ledRouter from './routes/led.js'
// import standByRouter from './routes/standby.js'

var app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: false }))

app.use('/', indexRouter)
app.use('/modem', modemRouter)
app.use('/sensor', sensorRouter)
app.use('/usb', usbRouter)
app.use('/gps', gpsRouter)
app.use('/led', ledRouter)
app.use('/peripherals', peripheralRouter)
app.use('/internet', internetRouter)
app.use('/radio', radioRouter)
app.use('/control', controlRouter)
// app.use('/standby', standByRouter)


// error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500)
  res.json({ error: err.message })
})

app.use((req, res, next) => {
  res.status(404)
  res.json({ error: 'page not found' })
})

export default app

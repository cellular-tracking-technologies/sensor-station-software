import express from 'express'
import path from 'path'
import logger from 'morgan'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import cookieParser from 'cookie-parser'

import Routes from './routes/index.js'
import Middleware from './middleware/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
console.log('startin on', __dirname)
console.log('example', path.join(__dirname, '../../../node_modules/highcharts'))

const app = express()
app.use(cookieParser())
app.set('view engine', 'pug')
app.set('views', path.join(__dirname, '/views'))

app.use(logger('dev'))
app.use(express.json())
app.use(express.raw({
  limit: '5mb'
}))
app.use(express.urlencoded({ extended: false }))
app.use(express.static(path.join(__dirname, './public')))
app.use('/highcharts', express.static(path.join(__dirname, '../../node_modules/highcharts')))
app.use('/bootstrap', express.static(path.join(__dirname, '../../node_modules/bootstrap')))
app.use('/jquery', express.static(path.join(__dirname, '../../node_modules/jquery')))
app.use('/moment', express.static(path.join(__dirname, '../../node_modules/moment')))

app.get('/', Middleware.Auth, Routes.Main)
app.get('/login', Routes.Login.Get)
app.post('/login', Routes.Login.Post)
app.get('/logout', Routes.Logout)
app.get('/register', Routes.Register.Get)
app.post('/register', Routes.Register.Post)

app.get('/blu', Middleware.Auth, Routes.Blu)

app.get('/update-station', Middleware.Auth, Routes.UpdateStation)
app.get('/crash', Routes.Crash)
app.get('/sg-deployment', Routes.Sensorgnome.Sgdeployment)
app.post('/save-sg-deployment', Routes.Sensorgnome.SaveSgDeployment)
app.post('/upload-sg-tag-file', Routes.Sensorgnome.UploadSgTagFile)

app.get('/ctt-data-current', Routes.Data.Ctt.DataCurrent)
app.get('/ctt-data-rotated', Routes.Data.Ctt.DataRotated)
app.get('/ctt-data-uploaded', Routes.Data.Ctt.DataUploaded)
app.get('/ctt-logfile', Routes.Data.Ctt.LogFile)
app.post('/delete-ctt-data-uploaded', Routes.Data.Ctt.DeleteUploaded)
app.post('/delete-ctt-data-rotated', Routes.Data.Ctt.DeleteRotated)
app.get('/sg-data-rotated', Routes.Data.Sg.RotatedData)
app.get('/sg-data-uploaded', Routes.Data.Sg.UploadedData)
app.post('/delete-sg-data-uploaded', Routes.Data.Sg.DeleteUploaded)
app.post('/delete-sg-data-rotated', Routes.Data.Sg.DeleteRotated)

app.post('/clear-log', Routes.Data.ClearLog)

app.get('/chrony', Routes.Controls.Chrony)
app.post('/reboot', Routes.Controls.Reboot)
app.get('/update', Middleware.Auth, Routes.UpdateStation)
app.post('/update', [Middleware.Auth, Middleware.Raw], Routes.Controls.Update)

app.get('/config', Routes.Controls.Config)
app.post('/radio-restart', Routes.Controls.RadioRestart)
app.post('/program-radios', Routes.Controls.ProgramRadios)

app.get('/software', Routes.Controls.Software)
app.get('/internet-gateway', Routes.Controls.InternetGateway)
app.get('/internet-wifi-strength', Routes.Controls.InternetWifiStrength)
app.get('/reboot-schedule', Routes.Controls.RebootSchedule)
app.post('/update-reboot-schedule', Routes.Controls.UpdateRebootSchedule)

app.post('/modem/enable', Routes.Controls.ModemEnable)
app.post('/modem/disable', Routes.Controls.ModemDisable)
app.get('/modem-signal-strength', Routes.Controls.ModemSignalStrength)
app.post('/wifi/enable', Routes.Controls.WifiEnable)
app.post('/wifi/disable', Routes.Controls.WifiDisable)
app.post('/wifi/connect', Routes.Controls.WifiConnect)
app.get('/wifi/networks', Routes.Controls.WifiNetworks)

app.use((req, res) => {
  res.sendStatus(404)
})

export default app

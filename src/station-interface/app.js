import express from 'express'
import path from 'path'
import logger from 'morgan'
import indexRouter from './routes/index.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
console.log('startin on', __dirname)
console.log('example', path.join(__dirname, '../../../node_modules/highcharts'))

const app = express()
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

app.use('/', indexRouter)

app.use((req, res, next) => {
  res.sendStatus(404)
})

export default app

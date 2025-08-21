import bodyParser from 'body-parser'

export default bodyParser.raw({
  limit: '50mb'
})
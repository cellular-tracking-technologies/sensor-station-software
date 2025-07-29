import IdUtils from './index.js'

const run = async () => {
  const id = await IdUtils.FromChip()
  console.log('id', id)
  if (id) {
    console.log(id.trim())
  } else {
    console.error('error reading ID from chip')
  }
  process.exit(0)
}

run()
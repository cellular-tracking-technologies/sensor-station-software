import fetch from 'node-fetch'

export default async () => {
  const station_id = await fetch('http://127.0.0.1:3000/id')
    .then(res => res.json())
    .then((json) => {
      const { id } = json
      return id
    })
    .catch((err) => {
      console.log('unable to request info from hardware server')
      console.error(err)
    })
  return station_id
}
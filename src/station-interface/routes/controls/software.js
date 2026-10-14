export default async (req, res) => {
  fetch('http://127.0.0.1:3000/node/version')
    .then(res => res.json())
    .then((json) => {
      res.json(json)
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500)
    })
}
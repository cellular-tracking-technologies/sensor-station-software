export default async (req, res) => {
  fetch('http://localhost:3000/internet/wifi-networks')
    .then(res => res.json())
    .then((json) => {
      res.json(json)
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500)
    })
}
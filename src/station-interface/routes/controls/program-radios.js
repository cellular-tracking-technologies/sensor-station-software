export default async (req, res) => {
  fetch('http://127.0.0.1:3000/program-radios')
    .then(() => {
      res.sendStatus(200)
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500)
    })
}
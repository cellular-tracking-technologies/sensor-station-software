export default async (req, res) => {
  fetch('http://localhost:3000/program-radios')
    .then(() => {
      res.sendStatus(200)
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500)
    })
}
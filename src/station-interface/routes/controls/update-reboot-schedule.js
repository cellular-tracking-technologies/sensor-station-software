export default async (req, res) => {
  console.log('rx', req.body)
  fetch('http://localhost:3000/control/update-reboot-schedule', {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  })
    .then((proxy_response) => {
      if (proxy_response.ok) {
        res.sendStatus(204)
      } else {
        res.sendStatus(proxy_response.status)
      }
    })
    .catch((err) => {
      console.error('error with reboot schedule  proxy post')
      console.error(err)
      res.sendStatus(500)
    })
}
import UserApi from '../users.js'

export default Object.freeze((req, res) => {
  res.clearCookie(UserApi.CookieName)
  res.redirect('/login')
})
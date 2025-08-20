import jwt from 'jsonwebtoken'
import UserApi from '../users.js'

export default (req, res, next) => {
  const { auth_token } = req.cookies
  if (!jwt) {
    // no authentication cookie
    return res.redirect('/login')
  }
  try {
    const token = jwt.verify(auth_token, UserApi.Secret)
    const { email } = token
    const user = UserApi.GetUser(email)
    req.user = user
    next()
  } catch (err) {
    return res.render('login-fail', {
      message: 'pug',
      headerText: 'Session has expired. Please login again.',
    })
  }
}
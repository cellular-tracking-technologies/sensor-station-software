import jwt from 'jsonwebtoken'
import UserApi from '../users.js'


export default (req, res, next) => {
  const users = UserApi.GetUsers()
  if (users.length < 1) {
    // No Users in the system
    return next()
  }
  const { auth_token } = req.cookies
  if (!auth_token) {
    // no authentication cookie
    return res.redirect('/login')
  }
  try {
    const token = jwt.verify(auth_token, UserApi.Secret)
    const { email } = token
    const user = users.find(user => user.email === email)
    if (user) {
      req.user = user
      return next()
    }
    // user not found
    console.log('vaid user token but not identified in users table')
    res.status(403).send('')
  } catch (err) {
    console.error('something went log during user verification')
    console.error(err)
    return res.render('login-fail', {
      message: 'pug',
      headerText: 'Session has expired. Please login again.',
    })
  }
}
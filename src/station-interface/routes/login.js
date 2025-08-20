import jwt from 'jsonwebtoken'
import UserApi from '../users.js'

export default Object.freeze({
  Get: (req, res) => {
    res.render('login', { title: 'CTT Login', message: 'pug' })
  },
  Post: (req, res) => {
    const { email, password } = req.body
    const user = UserApi.GetUser(email)
    if (user) {
      // email matched in users db - validate user password
      if (bcrypt.compare(password, user.password_hash) === true) {
        // password matches - sign new token
        const token = jwt.sign({ email },
          UserApi.Secret,
          { expiresIn: UserApi.SessionExpiration }
        )
        // save token in cookie
        res.cookie(UserApi.CookieName, token, { maxAge: 300000 })
        return res.redirect('/')
      } else {
        return res.render('login-fail', {
          headerText: 'Password is incorrect, please login again.'
        })
      }
    } else {
      // no user identified
      return res.render('login-fail', {
        headerText: 'Email not found.',
      })
    }
  },
})
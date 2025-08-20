import bcrypt from 'bcrypt'
import UserApi from '../users.js'

export default Object.freeze({
  Get: (req, res) => {
    res.render('register', { title: 'CTT Registration', message: 'pug' })
  },
  Post: (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400)
      res.send('Invalid Details!')
      return
    }
    // check if the user exists already
    const check_user = UserApi.GetUser(email)
    if (check_user) {
      // user exists - redirect to re-register
      res.render('register-fail', {
        headerText: 'Email already exists!  Login or choose another email',
      })
    }

    // create new user
    const hashed_password = bcrypt.hash(password, 10)
    UserApi.AddUser({ email, password: hashed_password })

    res.render('register-success', {
      title: 'Registration Successful'
    })
  }
})
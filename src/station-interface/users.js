import fs from 'fs'
import * as crypto from 'crypto'

const Secret = crypto.randomBytes(20).toString('hex')
const SessionExpiration = '5m'
const CookieName = 'auth_token'

const UserFile = '/etc/ctt/users.csv'

const GetUsers = () => {
  // load user db from file
  const content = fs.readFileSync(UserFile).toString()
  // map csv to objects
  return content.trim().split('\n').map((line) => {
    const [email, password_hash] = line.split(',')
    return {
      email: email.trim(),
      password_hash: password_hash.trim(),
    }
  })
}

export default Object.freeze({
  /**
   * authentication secret
   */
  Secret,
  /**
   * session expiration for logins
   */
  SessionExpiration,
  CookieName,
  GetUsers,
  GetUser: (email) => {
    return GetUsers().find(user => user.email === email)
  },
  /**
   * 
   * @param {Object} opts 
   * @param {String} opts.email
   * @param {String} opts.password
   */
  AddUser: (opts) => {
    const { email, password } = opts
    const line = `\n${email},${password}`
    fs.appendFileSync(UserFile, line)
  }
})
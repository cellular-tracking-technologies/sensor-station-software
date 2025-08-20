import fs from 'fs'
import * as crypto from 'crypto'

const Secret = crypto.randomBytes(20).toString('hex')
const SessionExpiration = '5m'
const CookieName = 'auth_token'

const UserFile = '/etc/ctt/users.csv'
if (fs.existsSync(UserFile) !== true) {
  fs.writeFileSync(UserFile, '')
}

const GetUsers = () => {
  // load user db from file
  const content = fs.readFileSync(UserFile).toString().trim()
  // map csv to objects
  if (content.search(',') < 1) {
    // empty file - no user records
    return []
  }
  return content.trim().split('\n').map((line) => {
    const [email, password_hash] = line.split(',')
    return {
      email: email.trim(),
      password_hash: password_hash.trim(),
    }
  }).filter(record => record.password_hash === undefined)
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
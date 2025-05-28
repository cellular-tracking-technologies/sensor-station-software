import sqlite3 from 'sqlite3'
import fs from 'fs'

const filepath = '/lib/ctt/sensor-station-software/src/station-interface/users.db'

function createDbConnection() {
  if (fs.existsSync(filepath)) {
    console.log('database file exists')
    return new sqlite3.Database(filepath)
  } else {
    console.log('database file does not exist')
    const db = new sqlite3.Database(filepath, (error) => {
      if (error) {
        return console.error(error.message)
      }
      createTable(db)
    })
    console.log('connection with sqlite has been established')
    return db
  }
}

function createTable(db) {
  db.exec(`
      CREATE TABLE IF NOT EXISTS users
      (
          id INTEGER,
          email VARCHAR(100) NOT NULL,
          password VARCHAR(100) NOT NULL
      )
  `)
}

async function getUsers(db) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM users`,
      [],
      (error, rows) => {
        if (error) {
          console.error(error.message)
          reject(error)
        }
        // console.log(rows);
        resolve(rows)
      })
  })
}

async function insertRow(db, email, password) {
  return new Promise((resolve, reject) => {

    //check to see if you need to make these anarray beforehand
    // console.log('number of users', await getUsers(db))
    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`,
      [email, password],
      function (error) {
        if (error) {
          console.error(error.message)
          reject(error)
        }
        console.log('Inserted a row with')
        resolve()
      }
    )
  })
}

function disconnectDb(db) {
  // Close the database
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Closed the database connection.');
  });
}

// const db = createDbConnection()
// const users = await getUsers(db)

// console.log('good return on users', users)
export { createDbConnection, getUsers, insertRow, disconnectDb }
import sqlite3 from 'sqlite3'
import fs from 'fs'

const filepath = '../users.db'

function createDbConnection() {
    if (fs.existsSync(filepath)) {
        return new sqlite3.Database(filepath)
    } else {
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

function getUsers() {
    let users
    db.all(`SELECT * FROM users`,
        [],
        (error, rows) => {
            if (error) {
                throw new Error(error.message);
            }
            // console.log(row);
            return rows
        }
    )
}

function insertRow(email, password) {
    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`,
        [email, password],
        function (error) {
            if (error) {
                console.error(error.message)
            }
            console.log('Inserted a row with')
        }
    )
}

function disconnectDb() {
    // Close the database
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Closed the database connection.');
    });
}

export { createDbConnection, getUsers, insertRow, disconnectDb }
import sqlite3 from 'sqlite3'
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run("CREATE TABLE lorem (info TEXT)");

  const stmt = db.prepare("INSERT INTO lorem VALUES (?)");
  for (let i = 0; i < 10; i++) {
    stmt.run("Ipsum " + i);
  }
  stmt.finalize();

  db.each("SELECT rowid AS id, info FROM lorem", (err, row) => {
    console.log(row.id + ": " + row.info);
  });
});

db.close();

// import duckdb from '@duckdb/node-api';
// import bcrypt from "bcrypt";

// const db = await duckdb.DuckDBInstance.create('./my_duckdb.db');
// const connection = await db.connect();

// connection.exec('CREATE SCHEMA IF NOT EXISTS user_schema')
// connection.exec('CREATE TABLE IF NOT EXISTS user_schema.users (email TEXT, password TEXT)')

// const result = connection.exec()
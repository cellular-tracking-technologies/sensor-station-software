import duckdb from '@duckdb/node-api';
import bcrypt from "bcrypt";

const db = await duckdb.DuckDBInstance.create('./my_duckdb.db');
const connection = await db.connect();

connection.exec('CREATE SCHEMA IF NOT EXISTS user_schema')
connection.exec('CREATE TABLE IF NOT EXISTS user_schema.users (email TEXT, password TEXT)')

const result = connection.exec()
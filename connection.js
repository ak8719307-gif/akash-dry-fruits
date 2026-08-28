// db/connection.js — single shared better-sqlite3 connection for the whole app
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'akash.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;

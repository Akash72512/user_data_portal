const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbFile = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbFile);

async function initDb() {
  await run(`PRAGMA foreign_keys = ON;`);
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      input_value REAL NOT NULL,
      output_value REAL NOT NULL,
      remaining_value REAL NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Seed default admin if none exists
  await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as c FROM users WHERE is_admin = 1', [], async (err, row) => {
      if (err) return reject(err);
      if (row.c === 0) {
        const bcrypt = require('bcrypt');
        const hashed = await bcrypt.hash('Admin@123', 10);
        db.run('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)',
          ['Admin', 'admin@example.com', hashed],
          (e) => {
            if (e) return reject(e);
            console.log('Seeded default admin: admin@example.com / Admin@123');
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  });
}

function run(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

module.exports = { db, initDb };

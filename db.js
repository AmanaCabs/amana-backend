// ─── DATABASE SETUP ───
// Uses better-sqlite3 — a synchronous, fast SQLite driver
// Creates tables on startup and seeds the first admin user

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'bookings.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── SCHEMA ───
const createTables = () => {
  // Bookings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      vehicle TEXT NOT NULL,
      package TEXT NOT NULL,
      trip_type TEXT DEFAULT 'oneway',
      state TEXT,
      city TEXT,
      pickup_address TEXT NOT NULL,
      drop_address TEXT,
      return_address TEXT,
      travel_date TEXT NOT NULL,
      pickup_time TEXT,
      persons INTEGER NOT NULL,
      age INTEGER,
      luggage_bags INTEGER DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'New',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Contact messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      subject TEXT,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Admin users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Indexes for faster queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(travel_date);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone);`);
};

// ─── SEED FIRST ADMIN ───
const seedAdmin = () => {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'amana2024';
  const name = process.env.ADMIN_NAME || 'Admin';

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (!existing) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO admins (username, password_hash, name, role) VALUES (?, ?, ?, ?)')
      .run(username, hash, name, 'admin');
    console.log(`✅ Default admin created → username: ${username}`);
  }
};

// Initialize on import
createTables();
seedAdmin();

console.log('✅ Database initialized at:', dbPath);

module.exports = db;

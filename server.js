// ═══════════════════════════════════════════════════════
//   AMANA CAB'S — COMPLETE BACKEND (single file)
//   Node.js + Express + SQLite
//   No external file dependencies needed
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const Database = require('better-sqlite3');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 5000;
const SECRET = process.env.JWT_SECRET || 'amana-secret-key-2026';

// ── DATABASE SETUP ───────────────────────────────────────
const db = new Database(path.join(__dirname, 'bookings.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    vehicle TEXT NOT NULL,
    package TEXT NOT NULL,
    trip_type TEXT DEFAULT 'oneway',
    state TEXT, city TEXT,
    pickup_address TEXT NOT NULL,
    drop_address TEXT, return_address TEXT,
    travel_date TEXT NOT NULL,
    pickup_time TEXT,
    persons INTEGER NOT NULL,
    age INTEGER, luggage_bags INTEGER DEFAULT 0,
    notes TEXT,
    status TEXT DEFAULT 'New',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, phone TEXT NOT NULL,
    email TEXT, subject TEXT, message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed admin
const adminUser = process.env.ADMIN_USERNAME || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || 'amana2024';
const adminName = process.env.ADMIN_NAME     || 'Admin';
const existing  = db.prepare('SELECT id FROM admins WHERE username = ?').get(adminUser);
if (!existing) {
  const hash = bcrypt.hashSync(adminPass, 10);
  db.prepare('INSERT INTO admins (username, password_hash, name) VALUES (?, ?, ?)').run(adminUser, hash, adminName);
  console.log('✅ Admin created:', adminUser);
}
console.log('✅ Database ready');

// ── MIDDLEWARE ────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });
  try {
    req.admin = jwt.verify(header.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function genId() { return 'AC' + Date.now().toString().slice(-6); }

// ── HEALTH ────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', service: "Amana Cab's API" });
});

// ── AUTH ROUTES ───────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'Invalid username or password' });

  const token = jwt.sign(
    { id: admin.id, username: admin.username, name: admin.name },
    SECRET, { expiresIn: '24h' }
  );
  res.json({ success: true, token, admin: { id: admin.id, username: admin.username, name: admin.name } });
});

app.get('/api/auth/verify', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ valid: false });
  try {
    const decoded = jwt.verify(header.slice(7), SECRET);
    res.json({ valid: true, admin: decoded });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// ── BOOKING ROUTES ────────────────────────────────────────
app.post('/api/bookings', (req, res) => {
  try {
    const {
      name, phone, email, vehicle, package: pkg,
      tripType, state, city, pickup, drop, returnAddress,
      date, time, persons, age, bags, notes
    } = req.body;

    if (!name || !phone || !vehicle || !pkg || !pickup || !date || !persons)
      return res.status(400).json({ error: 'Missing required fields' });

    const id = genId();
    db.prepare(`
      INSERT INTO bookings (
        id, name, phone, email, vehicle, package, trip_type,
        state, city, pickup_address, drop_address, return_address,
        travel_date, pickup_time, persons, age, luggage_bags, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, phone, email||null, vehicle, pkg, tripType||'oneway',
      state||null, city||null, pickup, drop||null, returnAddress||null,
      date, time||null, parseInt(persons), age?parseInt(age):null,
      bags?parseInt(bags):0, notes||null
    );

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

    // Generate WhatsApp URL for customer
    const msg = `🚗 *Booking Confirmed – Amana Cab's*\n\nHi ${name}! Your booking is confirmed.\n\n📋 *Details*\n• ID: ${id}\n• Vehicle: ${vehicle}\n• Package: ${pkg}\n• Pickup: ${pickup}, ${city||''}\n• Date: ${date} at ${time||'TBD'}\n• Passengers: ${persons}\n\nOur team will call you shortly. Safe travels! 🌟\n\n_Amana Cab's · +91 97002 00513_`;
    const customerUrl = `https://wa.me/${(phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;
    const bizAlert   = `🔔 *New Booking!*\n\nID: ${id}\nName: ${name}\nPhone: ${phone}\nVehicle: ${vehicle}\nPackage: ${pkg}\nDate: ${date} ${time||''}\nCity: ${city||''}\nPickup: ${pickup}`;
    const businessUrl = `https://wa.me/919700200513?text=${encodeURIComponent(bizAlert)}`;

    res.status(201).json({ success: true, booking, whatsapp: { customerUrl, businessUrl } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create booking', detail: err.message });
  }
});

app.get('/api/bookings/stats', authenticate, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  res.json({
    total:     db.prepare('SELECT COUNT(*) AS c FROM bookings').get().c,
    pending:   db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status='New'").get().c,
    confirmed: db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status='Confirmed'").get().c,
    completed: db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status='Completed'").get().c,
    cancelled: db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status='Cancelled'").get().c,
    today:     db.prepare('SELECT COUNT(*) AS c FROM bookings WHERE travel_date=?').get(today).c,
  });
});

app.get('/api/bookings', authenticate, (req, res) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (search) {
    sql += ' AND (name LIKE ? OR phone LIKE ? OR vehicle LIKE ? OR city LIKE ?)';
    const s = `%${search}%`; params.push(s, s, s, s);
  }
  sql += ' ORDER BY created_at DESC';
  const bookings = db.prepare(sql).all(...params);
  res.json({ bookings, count: bookings.length });
});

app.get('/api/bookings/:id', authenticate, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json({ booking });
});

app.patch('/api/bookings/:id/status', authenticate, (req, res) => {
  const { status } = req.body;
  if (!['New','Confirmed','Completed','Cancelled'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  const result = db.prepare('UPDATE bookings SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

app.delete('/api/bookings/:id', authenticate, (req, res) => {
  const result = db.prepare('DELETE FROM bookings WHERE id=?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── CONTACT ROUTES ────────────────────────────────────────
app.post('/api/contact', (req, res) => {
  const { name, phone, email, subject, message } = req.body;
  if (!name || !phone || !message)
    return res.status(400).json({ error: 'Name, phone and message required' });
  const result = db.prepare(
    'INSERT INTO contact_messages (name, phone, email, subject, message) VALUES (?, ?, ?, ?, ?)'
  ).run(name, phone, email||null, subject||null, message);
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/contact', authenticate, (req, res) => {
  const messages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
  res.json({ messages, count: messages.length });
});

app.patch('/api/contact/:id/read', authenticate, (req, res) => {
  db.prepare('UPDATE contact_messages SET is_read=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/contact/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM contact_messages WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── START ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  🚗  Amana Cab's Backend`);
  console.log(`  📡  Port: ${PORT}`);
  console.log(`  ✅  Ready`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

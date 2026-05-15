// ═══════════════════════════════════════════════════════
//   AMANA CAB'S — COMPLETE BACKEND (single file)
//   Node.js + Express + SQLite
//   No external file dependencies needed
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const Database   = require('better-sqlite3');
const path       = require('path');
const nodemailer = require('nodemailer');

const app    = express();
const PORT   = process.env.PORT   || 5000;
const SECRET = process.env.JWT_SECRET || 'amana-secret-key-2026';

// ── EMAIL SETUP ────────────────────────────────────────────
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL      || '';
const GMAIL_PASS   = process.env.GMAIL_APP_PASSWORD || '';
let mailer = null;
if (NOTIFY_EMAIL && GMAIL_PASS) {
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: NOTIFY_EMAIL, pass: GMAIL_PASS }
  });
  console.log('✅ Email alerts enabled →', NOTIFY_EMAIL);
} else {
  console.log('ℹ️  Set NOTIFY_EMAIL + GMAIL_APP_PASSWORD in Render to enable email alerts');
}

async function sendBookingEmail(booking) {
  if (!mailer || !NOTIFY_EMAIL) return;
  try {
    await mailer.sendMail({
      from: `"Amana Cab's" <${NOTIFY_EMAIL}>`,
      to: NOTIFY_EMAIL,
      subject: `🚗 New Booking! ${booking.id} — ${booking.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px">
          <div style="background:linear-gradient(135deg,#0ea5e9,#38bdf8);padding:20px 24px;border-radius:10px;margin-bottom:20px">
            <h2 style="color:#fff;margin:0;font-size:20px">🚗 New Booking Received!</h2>
            <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:14px">Amana Cab's · Admin Notification</p>
          </div>
          <div style="background:#fff;border-radius:10px;padding:20px;border:1px solid #e0f2fe">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b;width:140px">Booking ID</td><td style="padding:10px;font-weight:600;color:#0f172a">${booking.id}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Customer</td><td style="padding:10px;font-weight:600;color:#0f172a">${booking.name}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Phone</td><td style="padding:10px;font-weight:600;color:#0ea5e9">${booking.phone}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Vehicle</td><td style="padding:10px;color:#0f172a">${booking.vehicle}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Package</td><td style="padding:10px;color:#0f172a">${booking.package}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Pickup</td><td style="padding:10px;color:#0f172a">${booking.pickup_address}${booking.city ? ', ' + booking.city : ''}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Date & Time</td><td style="padding:10px;font-weight:600;color:#0f172a">${booking.travel_date} at ${booking.pickup_time || 'TBD'}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Passengers</td><td style="padding:10px;color:#0f172a">${booking.persons}</td></tr>
              <tr><td style="padding:10px;color:#64748b">Trip Type</td><td style="padding:10px;color:#0f172a">${booking.trip_type === 'roundtrip' ? 'Round Trip' : 'One Way'}</td></tr>
            </table>
          </div>
          <div style="margin-top:16px;padding:14px;background:#f0fdf4;border-radius:8px;border:1px solid #dcfce7;font-size:13px;color:#166534">
            ✅ Log in to your admin panel to confirm this booking.
          </div>
          <p style="margin-top:16px;font-size:12px;color:#94a3b8;text-align:center">Amana Cab's · +91 97002 00513 · amanacabs.in</p>
        </div>`
    });
    console.log('📧 Booking email sent for', booking.id);
  } catch (err) {
    console.error('Email send error:', err.message);
  }
}

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
  CREATE TABLE IF NOT EXISTS packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📦',
    category TEXT DEFAULT 'City',
    tagline TEXT,
    price TEXT,
    unit TEXT,
    vehicles TEXT,
    features TEXT DEFAULT '[]',
    image TEXT,
    popular INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'SUV',
    seats TEXT,
    luggage TEXT,
    sub TEXT,
    price TEXT,
    ac TEXT DEFAULT 'yes',
    tags TEXT DEFAULT '[]',
    image TEXT,
    sort_order INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// ── SEED DEFAULT PACKAGES ─────────────────────────────────
const DEF_PKGS = [
  {id:'p1',name:'4 Hr / 40 Km',icon:'🏙️',category:'City',tagline:'Ideal for short city trips and errands',price:'899',unit:'+ extras',vehicles:'All vehicles',features:JSON.stringify(['4 hours usage','40 km included','₹15/km extra','AC vehicle']),image:'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=700&q=80&auto=format&fit=crop',popular:0,sort_order:1},
  {id:'p2',name:'8 Hr / 80 Km',icon:'🗺️',category:'City',tagline:'Full-day city package — our best seller',price:'1499',unit:'+ extras',vehicles:'All vehicles',features:JSON.stringify(['8 hours usage','80 km included','₹13/km extra','Driver waiting']),image:'https://images.unsplash.com/photo-1569949381669-ecf31ae8e613?w=700&q=80&auto=format&fit=crop',popular:1,sort_order:2},
  {id:'p3',name:'Airport Transfer',icon:'✈️',category:'Airport',tagline:'Punctual airport pickups and drops',price:'799',unit:'onwards',vehicles:'Sedan / SUV',features:JSON.stringify(['Flight tracking','Meet & greet','1 hr free wait','24/7 available']),image:'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=700&q=80&auto=format&fit=crop',popular:0,sort_order:3},
  {id:'p4',name:'Outstation',icon:'🛣️',category:'Outstation',tagline:'Inter-city travel across South India',price:'12',unit:'/km',vehicles:'SUV / Premium',features:JSON.stringify(['One way or round trip','Highway drivers','Driver allowance','Toll extra']),image:'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=700&q=80&auto=format&fit=crop',popular:0,sort_order:4},
  {id:'p5',name:'Tour Package',icon:'🏖️',category:'Tour',tagline:'Multi-day sightseeing tours',price:'Custom',unit:'price',vehicles:'All vehicles',features:JSON.stringify(['1–7 day packages','Custom itinerary','Hotel coordination','Group discounts']),image:'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=700&q=80&auto=format&fit=crop',popular:0,sort_order:5},
  {id:'p6',name:'Corporate',icon:'🏢',category:'Corporate',tagline:'Dedicated business travel accounts',price:'Custom',unit:'pricing',vehicles:'Premium fleet',features:JSON.stringify(['Monthly billing','Dedicated fleet','GST invoice','Priority support']),image:'https://images.unsplash.com/photo-1497366216548-37526070297c?w=700&q=80&auto=format&fit=crop',popular:0,sort_order:6},
];
const pkgCount = db.prepare('SELECT COUNT(*) AS c FROM packages').get().c;
if (pkgCount === 0) {
  const ins = db.prepare('INSERT INTO packages (id,name,icon,category,tagline,price,unit,vehicles,features,image,popular,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  DEF_PKGS.forEach(p => ins.run(p.id,p.name,p.icon,p.category,p.tagline,p.price,p.unit,p.vehicles,p.features,p.image,p.popular,p.sort_order));
  console.log('✅ Default packages seeded');
}

// ── SEED DEFAULT VEHICLES ─────────────────────────────────
const DEF_VEHS = [
  {id:'v1',name:'Toyota Innova',type:'SUV',seats:'6+1 Seater',luggage:'3–4 Bags',sub:'Most trusted family & group cab',price:'',ac:'yes',tags:JSON.stringify(['City','Outstation','Airport','Group']),image:'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=700&q=80&auto=format&fit=crop',sort_order:1},
  {id:'v2',name:'Innova Crysta',type:'Premium',seats:'6+1 Seater',luggage:'4–5 Bags',sub:'Upgraded comfort with premium interiors',price:'',ac:'yes',tags:JSON.stringify(['Premium','Corporate','Airport']),image:'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=700&q=80&auto=format&fit=crop',sort_order:2},
  {id:'v3',name:'Maruti Ciaz',type:'Sedan',seats:'4+1 Seater',luggage:'2–3 Bags',sub:'Spacious sedan for business travel',price:'',ac:'yes',tags:JSON.stringify(['City','Airport','Business']),image:'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=700&q=80&auto=format&fit=crop',sort_order:3},
  {id:'v4',name:'Dzire / Etios',type:'Economy',seats:'4+1 Seater',luggage:'2 Bags',sub:'Reliable economy sedan',price:'',ac:'yes',tags:JSON.stringify(['Economy','City','Short Trip']),image:'https://images.unsplash.com/photo-1615906655593-ad0386982a0f?w=700&q=80&auto=format&fit=crop',sort_order:4},
  {id:'v5',name:'Kia Carens',type:'Premium',seats:'6+1 Seater',luggage:'3–4 Bags',sub:'Modern stylish ride for families',price:'',ac:'yes',tags:JSON.stringify(['Premium','Family','Tour']),image:'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=700&q=80&auto=format&fit=crop',sort_order:5},
  {id:'v6',name:'Tempo Traveller',type:'Group',seats:'12 Seater',luggage:'Large Boot',sub:'Large group travel',price:'',ac:'yes',tags:JSON.stringify(['Group','Events','Pilgrimage']),image:'https://images.unsplash.com/photo-1569087869659-0b73d96d8c5b?w=700&q=80&auto=format&fit=crop',sort_order:6},
];
const vehCount = db.prepare('SELECT COUNT(*) AS c FROM vehicles').get().c;
if (vehCount === 0) {
  const ins = db.prepare('INSERT INTO vehicles (id,name,type,seats,luggage,sub,price,ac,tags,image,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  DEF_VEHS.forEach(v => ins.run(v.id,v.name,v.type,v.seats,v.luggage,v.sub,v.price,v.ac,v.tags,v.image,v.sort_order));
  console.log('✅ Default vehicles seeded');
}

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

    // Send email notification to owner
    sendBookingEmail(booking).catch(console.error);

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

// ── PACKAGES ROUTES ──────────────────────────────────────
// PUBLIC: get all packages
app.get('/api/packages', (req, res) => {
  const rows = db.prepare('SELECT * FROM packages ORDER BY sort_order ASC').all();
  const packages = rows.map(p => ({...p, features: JSON.parse(p.features||'[]'), popular: !!p.popular}));
  res.json({ packages });
});

// ADMIN: create package
app.post('/api/packages', authenticate, (req, res) => {
  const { id, name, icon, category, tagline, price, unit, vehicles, features, image, popular } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const pid = id || 'p' + Date.now();
  const count = db.prepare('SELECT COUNT(*) AS c FROM packages').get().c;
  db.prepare('INSERT OR REPLACE INTO packages (id,name,icon,category,tagline,price,unit,vehicles,features,image,popular,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)')
    .run(pid, name, icon||'📦', category||'City', tagline||'', price||'', unit||'', vehicles||'', JSON.stringify(features||[]), image||'', popular?1:0, count+1);
  res.json({ success: true, id: pid });
});

// ADMIN: update package
app.put('/api/packages/:id', authenticate, (req, res) => {
  const { name, icon, category, tagline, price, unit, vehicles, features, image, popular } = req.body;
  db.prepare('UPDATE packages SET name=?,icon=?,category=?,tagline=?,price=?,unit=?,vehicles=?,features=?,image=?,popular=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name, icon||'📦', category||'City', tagline||'', price||'', unit||'', vehicles||'', JSON.stringify(features||[]), image||'', popular?1:0, req.params.id);
  res.json({ success: true });
});

// ADMIN: delete package
app.delete('/api/packages/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM packages WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── VEHICLES ROUTES ──────────────────────────────────────
// PUBLIC: get all vehicles
app.get('/api/vehicles', (req, res) => {
  const rows = db.prepare('SELECT * FROM vehicles ORDER BY sort_order ASC').all();
  const vehicles = rows.map(v => ({...v, tags: JSON.parse(v.tags||'[]')}));
  res.json({ vehicles });
});

// ADMIN: create vehicle
app.post('/api/vehicles', authenticate, (req, res) => {
  const { id, name, type, seats, luggage, sub, price, ac, tags, image } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const vid = id || 'v' + Date.now();
  const count = db.prepare('SELECT COUNT(*) AS c FROM vehicles').get().c;
  db.prepare('INSERT OR REPLACE INTO vehicles (id,name,type,seats,luggage,sub,price,ac,tags,image,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)')
    .run(vid, name, type||'SUV', seats||'', luggage||'', sub||'', price||'', ac||'yes', JSON.stringify(tags||[]), image||'', count+1);
  res.json({ success: true, id: vid });
});

// ADMIN: update vehicle
app.put('/api/vehicles/:id', authenticate, (req, res) => {
  const { name, type, seats, luggage, sub, price, ac, tags, image } = req.body;
  db.prepare('UPDATE vehicles SET name=?,type=?,seats=?,luggage=?,sub=?,price=?,ac=?,tags=?,image=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name, type||'SUV', seats||'', luggage||'', sub||'', price||'', ac||'yes', JSON.stringify(tags||[]), image||'', req.params.id);
  res.json({ success: true });
});

// ADMIN: delete vehicle
app.delete('/api/vehicles/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM vehicles WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── PACKAGES ROUTES ──────────────────────────────────────
// PUBLIC — get all packages
app.get('/api/packages', (req, res) => {
  const rows = db.prepare('SELECT * FROM packages ORDER BY sort_order').all();
  const packages = rows.map(p => ({...p, features: JSON.parse(p.features||'[]'), popular: !!p.popular}));
  res.json({ packages });
});
// ADMIN — create package
app.post('/api/packages', authenticate, (req, res) => {
  const {id,name,icon,category,tagline,price,unit,vehicles,features,image,popular} = req.body;
  if(!name) return res.status(400).json({error:'Name required'});
  const newId = id || 'p'+Date.now();
  const count = db.prepare('SELECT COUNT(*) AS c FROM packages').get().c;
  db.prepare('INSERT OR REPLACE INTO packages (id,name,icon,category,tagline,price,unit,vehicles,features,image,popular,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)')
    .run(newId,name,icon||'📦',category||'City',tagline||'',price||'',unit||'',vehicles||'',JSON.stringify(features||[]),image||'',popular?1:0,count+1);
  const pkg = db.prepare('SELECT * FROM packages WHERE id=?').get(newId);
  res.json({success:true,package:{...pkg,features:JSON.parse(pkg.features||'[]'),popular:!!pkg.popular}});
});
// ADMIN — update package
app.put('/api/packages/:id', authenticate, (req, res) => {
  const {name,icon,category,tagline,price,unit,vehicles,features,image,popular} = req.body;
  db.prepare('UPDATE packages SET name=?,icon=?,category=?,tagline=?,price=?,unit=?,vehicles=?,features=?,image=?,popular=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name,icon||'📦',category||'City',tagline||'',price||'',unit||'',vehicles||'',JSON.stringify(features||[]),image||'',popular?1:0,req.params.id);
  const pkg = db.prepare('SELECT * FROM packages WHERE id=?').get(req.params.id);
  if(!pkg) return res.status(404).json({error:'Not found'});
  res.json({success:true,package:{...pkg,features:JSON.parse(pkg.features||'[]'),popular:!!pkg.popular}});
});
// ADMIN — delete package
app.delete('/api/packages/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM packages WHERE id=?').run(req.params.id);
  res.json({success:true});
});

// ── VEHICLES ROUTES ───────────────────────────────────────
// PUBLIC — get all vehicles
app.get('/api/vehicles', (req, res) => {
  const rows = db.prepare('SELECT * FROM vehicles ORDER BY sort_order').all();
  const vehicles = rows.map(v => ({...v, tags: JSON.parse(v.tags||'[]')}));
  res.json({ vehicles });
});
// ADMIN — create vehicle
app.post('/api/vehicles', authenticate, (req, res) => {
  const {id,name,type,seats,luggage,sub,price,ac,tags,image} = req.body;
  if(!name) return res.status(400).json({error:'Name required'});
  const newId = id || 'v'+Date.now();
  const count = db.prepare('SELECT COUNT(*) AS c FROM vehicles').get().c;
  db.prepare('INSERT OR REPLACE INTO vehicles (id,name,type,seats,luggage,sub,price,ac,tags,image,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)')
    .run(newId,name,type||'SUV',seats||'',luggage||'',sub||'',price||'',ac||'yes',JSON.stringify(tags||[]),image||'',count+1);
  const veh = db.prepare('SELECT * FROM vehicles WHERE id=?').get(newId);
  res.json({success:true,vehicle:{...veh,tags:JSON.parse(veh.tags||'[]')}});
});
// ADMIN — update vehicle
app.put('/api/vehicles/:id', authenticate, (req, res) => {
  const {name,type,seats,luggage,sub,price,ac,tags,image} = req.body;
  db.prepare('UPDATE vehicles SET name=?,type=?,seats=?,luggage=?,sub=?,price=?,ac=?,tags=?,image=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name,type||'SUV',seats||'',luggage||'',sub||'',price||'',ac||'yes',JSON.stringify(tags||[]),image||'',req.params.id);
  const veh = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
  if(!veh) return res.status(404).json({error:'Not found'});
  res.json({success:true,vehicle:{...veh,tags:JSON.parse(veh.tags||'[]')}});
});
// ADMIN — delete vehicle
app.delete('/api/vehicles/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM vehicles WHERE id=?').run(req.params.id);
  res.json({success:true});
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

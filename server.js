// ═══════════════════════════════════════════════════════
//   AMANA CAB'S — BACKEND (Turso Cloud SQLite)
//   Persistent database — data never lost on restart
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const { createClient } = require('@libsql/client');
const { Resend } = require('resend');

const app    = express();
const PORT   = process.env.PORT   || 5000;
const SECRET = process.env.JWT_SECRET || 'amana-secret-2026';

// ── TURSO DATABASE ────────────────────────────────────────
const db = createClient({
  url:       process.env.TURSO_URL   || '',
  authToken: process.env.TURSO_TOKEN || '',
});
console.log('✅ Turso client created');

// ── EMAIL (Resend — works on Render) ──────────────────────
const NOTIFY_EMAIL = (process.env.NOTIFY_EMAIL || '').trim();
const RESEND_KEY   = (process.env.RESEND_API_KEY || '').trim();
let resend = null;
if (RESEND_KEY && NOTIFY_EMAIL) {
  resend = new Resend(RESEND_KEY);
  console.log('✅ Resend email ready → alerts to', NOTIFY_EMAIL);
} else {
  console.log('ℹ️  Email: add RESEND_API_KEY + NOTIFY_EMAIL on Render to enable');
}

// ── SETUP TABLES ──────────────────────────────────────────
async function setupDB() {
  await db.execute(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
    vehicle TEXT NOT NULL, package TEXT NOT NULL, trip_type TEXT DEFAULT 'oneway',
    state TEXT, city TEXT, pickup_address TEXT NOT NULL, drop_address TEXT,
    return_address TEXT, travel_date TEXT NOT NULL, pickup_time TEXT,
    persons INTEGER NOT NULL DEFAULT 1, age INTEGER, luggage_bags INTEGER DEFAULT 0,
    notes TEXT, status TEXT DEFAULT 'New',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    phone TEXT NOT NULL, email TEXT, subject TEXT, message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, name TEXT NOT NULL, role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS packages (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT '📦',
    category TEXT DEFAULT 'City', tagline TEXT, price TEXT, unit TEXT,
    vehicles TEXT, features TEXT DEFAULT '[]', image TEXT,
    popular INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'SUV',
    seats TEXT, luggage TEXT, sub TEXT, price TEXT, ac TEXT DEFAULT 'yes',
    tags TEXT DEFAULT '[]', image TEXT, sort_order INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('✅ All tables ready');

  // Seed admin
  const AU = process.env.ADMIN_USERNAME || 'admin';
  const AP = process.env.ADMIN_PASSWORD || 'amana2024';
  const existing = await db.execute({ sql: 'SELECT id FROM admins WHERE username=?', args: [AU] });
  if (!existing.rows.length) {
    await db.execute({ sql: 'INSERT INTO admins (username,password_hash,name) VALUES (?,?,?)',
      args: [AU, await bcrypt.hash(AP, 10), 'Admin'] });
    console.log('✅ Admin created');
  }

  // Seed packages
  const pkgCount = await db.execute('SELECT COUNT(*) AS c FROM packages');
  if (!pkgCount.rows[0].c) {
    const pkgs = [
      ['p1','4 Hr / 40 Km','🏙️','City','Ideal for short city trips','899','+ extras','All vehicles',JSON.stringify(['4 hours','40 km','₹15/km extra']),'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=700&q=80&auto=format&fit=crop',0,1],
      ['p2','8 Hr / 80 Km','🗺️','City','Full-day city — best seller','1499','+ extras','All vehicles',JSON.stringify(['8 hours','80 km','Wait included']),'https://images.unsplash.com/photo-1569949381669-ecf31ae8e613?w=700&q=80&auto=format&fit=crop',1,2],
      ['p3','Airport Transfer','✈️','Airport','Punctual pickup & drop','799','onwards','Sedan / SUV',JSON.stringify(['Flight tracking','Meet & greet','24/7']),'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=700&q=80&auto=format&fit=crop',0,3],
      ['p4','Outstation','🛣️','Outstation','Inter-city travel','12','/km','SUV / Premium',JSON.stringify(['One/round trip','Highway drivers']),'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=700&q=80&auto=format&fit=crop',0,4],
      ['p5','Tour Package','🏖️','Tour','Multi-day sightseeing','Custom','price','All vehicles',JSON.stringify(['1–7 days','Custom itinerary']),'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=700&q=80&auto=format&fit=crop',0,5],
      ['p6','Corporate','🏢','Corporate','Business travel accounts','Custom','pricing','Premium fleet',JSON.stringify(['Monthly billing','GST invoice']),'https://images.unsplash.com/photo-1497366216548-37526070297c?w=700&q=80&auto=format&fit=crop',0,6],
    ];
    for (const p of pkgs) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO packages (id,name,icon,category,tagline,price,unit,vehicles,features,image,popular,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', args: p });
    }
    console.log('✅ Packages seeded');
  }

  // Seed vehicles
  const vehCount = await db.execute('SELECT COUNT(*) AS c FROM vehicles');
  if (!vehCount.rows[0].c) {
    const vehs = [
      ['v1','Toyota Innova','SUV','6+1 Seater','3–4 Bags','Most trusted family cab','','yes',JSON.stringify(['City','Outstation','Airport']),'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=700&q=80&auto=format&fit=crop',1],
      ['v2','Innova Crysta','Premium','6+1 Seater','4–5 Bags','Premium interiors','','yes',JSON.stringify(['Premium','Corporate']),'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=700&q=80&auto=format&fit=crop',2],
      ['v3','Maruti Ciaz','Sedan','4+1 Seater','2–3 Bags','Business sedan','','yes',JSON.stringify(['City','Business']),'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=700&q=80&auto=format&fit=crop',3],
      ['v4','Dzire / Etios','Economy','4+1 Seater','2 Bags','Economy sedan','','yes',JSON.stringify(['Economy','City']),'https://images.unsplash.com/photo-1615906655593-ad0386982a0f?w=700&q=80&auto=format&fit=crop',4],
      ['v5','Kia Carens','Premium','6+1 Seater','3–4 Bags','Modern family ride','','yes',JSON.stringify(['Premium','Family']),'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=700&q=80&auto=format&fit=crop',5],
      ['v6','Tempo Traveller','Group','12 Seater','Large Boot','Group travel','','yes',JSON.stringify(['Group','Events']),'https://images.unsplash.com/photo-1569087869659-0b73d96d8c5b?w=700&q=80&auto=format&fit=crop',6],
    ];
    for (const v of vehs) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO vehicles (id,name,type,seats,luggage,sub,price,ac,tags,image,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)', args: v });
    }
    console.log('✅ Vehicles seeded');
  }
}

// ── MIDDLEWARE ────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function authenticate(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try { req.admin = jwt.verify(h.slice(7), SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function genId() { return 'AC' + Date.now().toString().slice(-6); }

// ── HEALTH ────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', db: 'Turso' }));

// ── AUTH ──────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Required' });
    const r = await db.execute({ sql: 'SELECT * FROM admins WHERE username=?', args: [username] });
    const admin = r.rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash)))
      return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: admin.id, username: admin.username, name: admin.name }, SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, admin: { id: admin.id, username: admin.username, name: admin.name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/verify', (req, res) => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ valid: false });
  try { res.json({ valid: true, admin: jwt.verify(h.slice(7), SECRET) }); }
  catch { res.status(401).json({ valid: false }); }
});

// ── PACKAGES ──────────────────────────────────────────────
app.get('/api/packages', async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM packages ORDER BY sort_order');
    res.json({ packages: r.rows.map(p => ({ ...p, features: JSON.parse(p.features||'[]'), popular: !!p.popular })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/packages', authenticate, async (req, res) => {
  try {
    const { id, name, icon, category, tagline, price, unit, vehicles, features, image, popular } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const newId = id || 'p' + Date.now();
    const cnt = await db.execute('SELECT COUNT(*) AS c FROM packages');
    await db.execute({ sql: 'INSERT OR REPLACE INTO packages (id,name,icon,category,tagline,price,unit,vehicles,features,image,popular,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [newId, name, icon||'📦', category||'City', tagline||'', price||'', unit||'', vehicles||'', JSON.stringify(features||[]), image||'', popular?1:0, Number(cnt.rows[0].c)+1] });
    const pkg = (await db.execute({ sql: 'SELECT * FROM packages WHERE id=?', args: [newId] })).rows[0];
    res.json({ success: true, package: { ...pkg, features: JSON.parse(pkg.features||'[]'), popular: !!pkg.popular } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/packages/:id', authenticate, async (req, res) => {
  try {
    const { name, icon, category, tagline, price, unit, vehicles, features, image, popular } = req.body;
    await db.execute({ sql: 'UPDATE packages SET name=?,icon=?,category=?,tagline=?,price=?,unit=?,vehicles=?,features=?,image=?,popular=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      args: [name, icon||'📦', category||'City', tagline||'', price||'', unit||'', vehicles||'', JSON.stringify(features||[]), image||'', popular?1:0, req.params.id] });
    const pkg = (await db.execute({ sql: 'SELECT * FROM packages WHERE id=?', args: [req.params.id] })).rows[0];
    if (!pkg) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, package: { ...pkg, features: JSON.parse(pkg.features||'[]'), popular: !!pkg.popular } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/packages/:id', authenticate, async (req, res) => {
  try { await db.execute({ sql: 'DELETE FROM packages WHERE id=?', args: [req.params.id] }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VEHICLES ──────────────────────────────────────────────
app.get('/api/vehicles', async (req, res) => {
  try {
    const r = await db.execute('SELECT * FROM vehicles ORDER BY sort_order');
    res.json({ vehicles: r.rows.map(v => ({ ...v, tags: JSON.parse(v.tags||'[]') })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/vehicles', authenticate, async (req, res) => {
  try {
    const { id, name, type, seats, luggage, sub, price, ac, tags, image } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const newId = id || 'v' + Date.now();
    const cnt = await db.execute('SELECT COUNT(*) AS c FROM vehicles');
    await db.execute({ sql: 'INSERT OR REPLACE INTO vehicles (id,name,type,seats,luggage,sub,price,ac,tags,image,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      args: [newId, name, type||'SUV', seats||'', luggage||'', sub||'', price||'', ac||'yes', JSON.stringify(tags||[]), image||'', Number(cnt.rows[0].c)+1] });
    const veh = (await db.execute({ sql: 'SELECT * FROM vehicles WHERE id=?', args: [newId] })).rows[0];
    res.json({ success: true, vehicle: { ...veh, tags: JSON.parse(veh.tags||'[]') } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/vehicles/:id', authenticate, async (req, res) => {
  try {
    const { name, type, seats, luggage, sub, price, ac, tags, image } = req.body;
    await db.execute({ sql: 'UPDATE vehicles SET name=?,type=?,seats=?,luggage=?,sub=?,price=?,ac=?,tags=?,image=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      args: [name, type||'SUV', seats||'', luggage||'', sub||'', price||'', ac||'yes', JSON.stringify(tags||[]), image||'', req.params.id] });
    const veh = (await db.execute({ sql: 'SELECT * FROM vehicles WHERE id=?', args: [req.params.id] })).rows[0];
    if (!veh) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, vehicle: { ...veh, tags: JSON.parse(veh.tags||'[]') } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/vehicles/:id', authenticate, async (req, res) => {
  try { await db.execute({ sql: 'DELETE FROM vehicles WHERE id=?', args: [req.params.id] }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── BOOKINGS ──────────────────────────────────────────────
app.post('/api/bookings', async (req, res) => {
  try {
    const { name, phone, email, vehicle, package: pkg, tripType, state, city, pickup, drop, returnAddress, date, time, persons, age, bags, notes } = req.body;
    if (!name || !phone || !vehicle || !pkg || !pickup || !date || !persons)
      return res.status(400).json({ error: 'Missing required fields' });
    const id = genId();
    await db.execute({ sql: 'INSERT INTO bookings (id,name,phone,email,vehicle,package,trip_type,state,city,pickup_address,drop_address,return_address,travel_date,pickup_time,persons,age,luggage_bags,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [id, name, phone, email||null, vehicle, pkg, tripType||'oneway', state||null, city||null, pickup, drop||null, returnAddress||null, date, time||null, parseInt(persons), age?parseInt(age):null, bags?parseInt(bags):0, notes||null] });
    const booking = (await db.execute({ sql: 'SELECT * FROM bookings WHERE id=?', args: [id] })).rows[0];
    sendBookingEmail(booking);
    res.status(201).json({ success: true, booking });
  } catch (e) { console.error('Booking error:', e.message); res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/bookings/stats', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [total, pending, confirmed, completed, cancelled, todayR] = await Promise.all([
      db.execute('SELECT COUNT(*) AS c FROM bookings'),
      db.execute("SELECT COUNT(*) AS c FROM bookings WHERE status='New'"),
      db.execute("SELECT COUNT(*) AS c FROM bookings WHERE status='Confirmed'"),
      db.execute("SELECT COUNT(*) AS c FROM bookings WHERE status='Completed'"),
      db.execute("SELECT COUNT(*) AS c FROM bookings WHERE status='Cancelled'"),
      db.execute({ sql: 'SELECT COUNT(*) AS c FROM bookings WHERE travel_date=?', args: [today] }),
    ]);
    res.json({ total: total.rows[0].c, pending: pending.rows[0].c, confirmed: confirmed.rows[0].c, completed: completed.rows[0].c, cancelled: cancelled.rows[0].c, today: todayR.rows[0].c });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/bookings', authenticate, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = 'SELECT * FROM bookings WHERE 1=1'; const args = [];
    if (status && status !== 'all') { sql += ' AND status=?'; args.push(status); }
    if (search) { sql += ' AND (name LIKE ? OR phone LIKE ? OR vehicle LIKE ? OR city LIKE ?)'; const s='%'+search+'%'; args.push(s,s,s,s); }
    sql += ' ORDER BY created_at DESC';
    const r = await db.execute({ sql, args });
    res.json({ bookings: r.rows, count: r.rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/bookings/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['New','Confirmed','Completed','Cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await db.execute({ sql: 'UPDATE bookings SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', args: [status, req.params.id] });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bookings/:id', authenticate, async (req, res) => {
  try { await db.execute({ sql: 'DELETE FROM bookings WHERE id=?', args: [req.params.id] }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CONTACT ───────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body;
    if (!name || !phone || !message) return res.status(400).json({ error: 'Required' });
    const r = await db.execute({ sql: 'INSERT INTO contact_messages (name,phone,email,subject,message) VALUES (?,?,?,?,?)', args: [name, phone, email||null, subject||null, message] });
    res.status(201).json({ success: true, id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/contact', authenticate, async (req, res) => {
  try { const r = await db.execute('SELECT * FROM contact_messages ORDER BY created_at DESC'); res.json({ messages: r.rows }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/contact/:id', authenticate, async (req, res) => {
  try { await db.execute({ sql: 'DELETE FROM contact_messages WHERE id=?', args: [req.params.id] }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EMAIL ─────────────────────────────────────────────────
async function sendBookingEmail(b) {
  if (!resend || !NOTIFY_EMAIL) { console.log('ℹ️  Email skipped'); return; }
  console.log('📧 Sending email for', b.id);
  try {
    await resend.emails.send({
      from: 'Amana Cab\'s <onboarding@resend.dev>',
      to: NOTIFY_EMAIL,
      subject: '🚗 New Booking! ' + b.id + ' — ' + b.name,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#0ea5e9,#38bdf8);padding:20px;border-radius:10px 10px 0 0">
          <h2 style="color:#fff;margin:0">🚗 New Booking!</h2>
        </div>
        <div style="background:#fff;padding:20px;border:1px solid #e0f2fe;border-radius:0 0 10px 10px">
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Booking ID</td><td style="padding:10px;font-weight:700;color:#0ea5e9">${b.id}</td></tr>
            <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Customer</td><td style="padding:10px">${b.name}</td></tr>
            <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Phone</td><td style="padding:10px"><a href="tel:${b.phone}" style="color:#0ea5e9">${b.phone}</a></td></tr>
            <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Vehicle</td><td style="padding:10px">${b.vehicle}</td></tr>
            <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Package</td><td style="padding:10px">${b.package}</td></tr>
            <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Pickup</td><td style="padding:10px">${b.pickup_address}${b.city ? ', '+b.city : ''}</td></tr>
            <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Date & Time</td><td style="padding:10px;font-weight:600">${b.travel_date} at ${b.pickup_time||'TBD'}</td></tr>
            <tr><td style="padding:10px;color:#64748b">Passengers</td><td style="padding:10px">${b.persons}</td></tr>
          </table>
          <div style="margin-top:14px;padding:12px;background:#f0fdf4;border-radius:8px;font-size:13px;color:#166534">
            ✅ Log in to admin panel to confirm.
          </div>
        </div>
      </div>`
    });
    console.log('✅ Email sent for', b.id);
  } catch (e) { console.error('❌ Resend failed:', e.message); }
}

// ── START ─────────────────────────────────────────────────
setupDB().then(() => {
  app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🚗  Amana Cab\'s Backend');
    console.log('  📡  Port:', PORT);
    console.log('  🗄️   Turso cloud database');
    console.log('  ✅  Ready');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}).catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});

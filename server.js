// ═══════════════════════════════════════════════════════
//   AMANA CAB'S — BACKEND (AWS RDS MySQL + Gmail Email)
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const mysql      = require('mysql2/promise');
const nodemailer = require('nodemailer');

const app    = express();
const PORT   = process.env.PORT   || 5000;
const SECRET = process.env.JWT_SECRET || 'amana-secret-key-2026';

// ── EMAIL SETUP ───────────────────────────────────────────
const NOTIFY_EMAIL = (process.env.NOTIFY_EMAIL       || '').trim();
const GMAIL_PASS   = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, ''); // auto-strip spaces
let mailer = null;

if (NOTIFY_EMAIL && GMAIL_PASS) {
  mailer = nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:    587,
    secure:  false,
    auth:  { user: NOTIFY_EMAIL, pass: GMAIL_PASS },
    tls:   { rejectUnauthorized: false }
  });
  // Test the connection on startup
  mailer.verify(function(err) {
    if (err) {
      console.error('❌ Gmail connection failed:', err.message);
      console.error('   → Check NOTIFY_EMAIL and GMAIL_APP_PASSWORD on Render (no spaces in password)');
      mailer = null;
    } else {
      console.log('✅ Gmail ready — booking alerts → ' + NOTIFY_EMAIL);
    }
  });
} else {
  console.log('ℹ️  Email not configured. Add NOTIFY_EMAIL + GMAIL_APP_PASSWORD on Render to enable.');
}

// ── AWS RDS MySQL POOL ────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'admin',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'amanacabs',
  port:     parseInt(process.env.DB_PORT || '3306'),
  ssl:      process.env.DB_HOST ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit:    10,
  connectTimeout:     30000,
});

// ── DATABASE SETUP ────────────────────────────────────────
async function setupDB() {
  const db = await pool.getConnection();
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS bookings (
      id VARCHAR(20) PRIMARY KEY,
      name VARCHAR(255) NOT NULL, phone VARCHAR(20) NOT NULL, email VARCHAR(255),
      vehicle VARCHAR(255) NOT NULL, package VARCHAR(255) NOT NULL,
      trip_type VARCHAR(20) DEFAULT 'oneway', state VARCHAR(100), city VARCHAR(100),
      pickup_address TEXT NOT NULL, drop_address TEXT, return_address TEXT,
      travel_date VARCHAR(20) NOT NULL, pickup_time VARCHAR(20),
      persons INT NOT NULL DEFAULT 1, age INT, luggage_bags INT DEFAULT 0, notes TEXT,
      status VARCHAR(20) DEFAULT 'New',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS contact_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL, phone VARCHAR(20) NOT NULL,
      email VARCHAR(255), subject VARCHAR(255), message TEXT NOT NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL, role VARCHAR(50) DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS packages (
      id VARCHAR(50) PRIMARY KEY, name VARCHAR(255) NOT NULL,
      icon VARCHAR(10) DEFAULT '📦', category VARCHAR(50) DEFAULT 'City',
      tagline VARCHAR(500), price VARCHAR(50), unit VARCHAR(50),
      vehicles VARCHAR(255), features JSON, image TEXT,
      popular TINYINT(1) DEFAULT 0, sort_order INT DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS vehicles (
      id VARCHAR(50) PRIMARY KEY, name VARCHAR(255) NOT NULL,
      type VARCHAR(50) DEFAULT 'SUV', seats VARCHAR(50), luggage VARCHAR(50),
      sub VARCHAR(500), price VARCHAR(50), ac VARCHAR(5) DEFAULT 'yes',
      tags JSON, image TEXT, sort_order INT DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    console.log('✅ All tables ready');

    // Seed admin
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'amana2024';
    const [existing] = await db.execute('SELECT id FROM admins WHERE username = ?', [adminUser]);
    if (!existing.length) {
      const hash = await bcrypt.hash(adminPass, 10);
      await db.execute('INSERT INTO admins (username, password_hash, name) VALUES (?, ?, ?)', [adminUser, hash, 'Admin']);
      console.log('✅ Admin created:', adminUser);
    }

    // Seed packages
    const [[{ pc }]] = await db.execute('SELECT COUNT(*) AS pc FROM packages');
    if (pc === 0) {
      const pkgs = [
        ['p1','4 Hr / 40 Km','🏙️','City','Ideal for short city trips','899','+ extras','All vehicles',JSON.stringify(['4 hours','40 km','₹15/km extra']),'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=700&q=80&auto=format&fit=crop',0,1],
        ['p2','8 Hr / 80 Km','🗺️','City','Full-day city — best seller','1499','+ extras','All vehicles',JSON.stringify(['8 hours','80 km','Wait included']),'https://images.unsplash.com/photo-1569949381669-ecf31ae8e613?w=700&q=80&auto=format&fit=crop',1,2],
        ['p3','Airport Transfer','✈️','Airport','Punctual pickup & drop','799','onwards','Sedan / SUV',JSON.stringify(['Flight tracking','Meet & greet','24/7']),'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=700&q=80&auto=format&fit=crop',0,3],
        ['p4','Outstation','🛣️','Outstation','Inter-city travel','12','/km','SUV / Premium',JSON.stringify(['One/round trip','Highway drivers']),'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=700&q=80&auto=format&fit=crop',0,4],
        ['p5','Tour Package','🏖️','Tour','Multi-day sightseeing','Custom','price','All vehicles',JSON.stringify(['1–7 days','Custom itinerary']),'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=700&q=80&auto=format&fit=crop',0,5],
        ['p6','Corporate','🏢','Corporate','Business travel accounts','Custom','pricing','Premium fleet',JSON.stringify(['Monthly billing','GST invoice']),'https://images.unsplash.com/photo-1497366216548-37526070297c?w=700&q=80&auto=format&fit=crop',0,6],
      ];
      for (const p of pkgs) await db.execute('INSERT IGNORE INTO packages (id,name,icon,category,tagline,price,unit,vehicles,features,image,popular,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', p);
      console.log('✅ Default packages seeded');
    }

    // Seed vehicles
    const [[{ vc }]] = await db.execute('SELECT COUNT(*) AS vc FROM vehicles');
    if (vc === 0) {
      const vehs = [
        ['v1','Toyota Innova','SUV','6+1 Seater','3–4 Bags','Most trusted family cab','','yes',JSON.stringify(['City','Outstation','Airport']),'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=700&q=80&auto=format&fit=crop',1],
        ['v2','Innova Crysta','Premium','6+1 Seater','4–5 Bags','Premium interiors','','yes',JSON.stringify(['Premium','Corporate']),'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=700&q=80&auto=format&fit=crop',2],
        ['v3','Maruti Ciaz','Sedan','4+1 Seater','2–3 Bags','Business sedan','','yes',JSON.stringify(['City','Business']),'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=700&q=80&auto=format&fit=crop',3],
        ['v4','Dzire / Etios','Economy','4+1 Seater','2 Bags','Economy sedan','','yes',JSON.stringify(['Economy','City']),'https://images.unsplash.com/photo-1615906655593-ad0386982a0f?w=700&q=80&auto=format&fit=crop',4],
        ['v5','Kia Carens','Premium','6+1 Seater','3–4 Bags','Modern family ride','','yes',JSON.stringify(['Premium','Family']),'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=700&q=80&auto=format&fit=crop',5],
        ['v6','Tempo Traveller','Group','12 Seater','Large Boot','Group travel','','yes',JSON.stringify(['Group','Events']),'https://images.unsplash.com/photo-1569087869659-0b73d96d8c5b?w=700&q=80&auto=format&fit=crop',6],
      ];
      for (const v of vehs) await db.execute('INSERT IGNORE INTO vehicles (id,name,type,seats,luggage,sub,price,ac,tags,image,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)', v);
      console.log('✅ Default vehicles seeded');
    }
  } finally { db.release(); }
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
app.get('/api/health', (_, res) => res.json({ status: 'ok', service: "Amana Cab's API", db: 'AWS RDS MySQL' }));

// ── AUTH ──────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const [rows] = await pool.execute('SELECT * FROM admins WHERE username = ?', [username]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash)))
      return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: admin.id, username: admin.username, name: admin.name }, SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, admin: { id: admin.id, username: admin.username, name: admin.name } });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
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
    const [rows] = await pool.execute('SELECT * FROM packages ORDER BY sort_order ASC');
    res.json({ packages: rows.map(p => ({ ...p, features: p.features || [], popular: !!p.popular })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/packages', authenticate, async (req, res) => {
  const { id, name, icon, category, tagline, price, unit, vehicles, features, image, popular } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const newId = id || 'p' + Date.now();
  try {
    const [[{ c }]] = await pool.execute('SELECT COUNT(*) AS c FROM packages');
    await pool.execute('INSERT INTO packages (id,name,icon,category,tagline,price,unit,vehicles,features,image,popular,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [newId, name, icon||'📦', category||'City', tagline||'', price||'', unit||'', vehicles||'', JSON.stringify(features||[]), image||'', popular?1:0, c+1]);
    const [[pkg]] = await pool.execute('SELECT * FROM packages WHERE id = ?', [newId]);
    res.json({ success: true, package: { ...pkg, features: pkg.features||[], popular: !!pkg.popular } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/packages/:id', authenticate, async (req, res) => {
  const { name, icon, category, tagline, price, unit, vehicles, features, image, popular } = req.body;
  try {
    await pool.execute('UPDATE packages SET name=?,icon=?,category=?,tagline=?,price=?,unit=?,vehicles=?,features=?,image=?,popular=? WHERE id=?',
      [name, icon||'📦', category||'City', tagline||'', price||'', unit||'', vehicles||'', JSON.stringify(features||[]), image||'', popular?1:0, req.params.id]);
    const [[pkg]] = await pool.execute('SELECT * FROM packages WHERE id = ?', [req.params.id]);
    if (!pkg) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, package: { ...pkg, features: pkg.features||[], popular: !!pkg.popular } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/packages/:id', authenticate, async (req, res) => {
  try { await pool.execute('DELETE FROM packages WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── VEHICLES ──────────────────────────────────────────────
app.get('/api/vehicles', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM vehicles ORDER BY sort_order ASC');
    res.json({ vehicles: rows.map(v => ({ ...v, tags: v.tags || [] })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vehicles', authenticate, async (req, res) => {
  const { id, name, type, seats, luggage, sub, price, ac, tags, image } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const newId = id || 'v' + Date.now();
  try {
    const [[{ c }]] = await pool.execute('SELECT COUNT(*) AS c FROM vehicles');
    await pool.execute('INSERT INTO vehicles (id,name,type,seats,luggage,sub,price,ac,tags,image,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [newId, name, type||'SUV', seats||'', luggage||'', sub||'', price||'', ac||'yes', JSON.stringify(tags||[]), image||'', c+1]);
    const [[veh]] = await pool.execute('SELECT * FROM vehicles WHERE id = ?', [newId]);
    res.json({ success: true, vehicle: { ...veh, tags: veh.tags||[] } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/vehicles/:id', authenticate, async (req, res) => {
  const { name, type, seats, luggage, sub, price, ac, tags, image } = req.body;
  try {
    await pool.execute('UPDATE vehicles SET name=?,type=?,seats=?,luggage=?,sub=?,price=?,ac=?,tags=?,image=? WHERE id=?',
      [name, type||'SUV', seats||'', luggage||'', sub||'', price||'', ac||'yes', JSON.stringify(tags||[]), image||'', req.params.id]);
    const [[veh]] = await pool.execute('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
    if (!veh) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, vehicle: { ...veh, tags: veh.tags||[] } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/vehicles/:id', authenticate, async (req, res) => {
  try { await pool.execute('DELETE FROM vehicles WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── BOOKINGS ──────────────────────────────────────────────
app.post('/api/bookings', async (req, res) => {
  try {
    const { name, phone, email, vehicle, package: pkg, tripType, state, city, pickup, drop, returnAddress, date, time, persons, age, bags, notes } = req.body;
    if (!name || !phone || !vehicle || !pkg || !pickup || !date || !persons)
      return res.status(400).json({ error: 'Missing required fields' });
    const id = genId();
    await pool.execute(
      `INSERT INTO bookings (id,name,phone,email,vehicle,package,trip_type,state,city,pickup_address,drop_address,return_address,travel_date,pickup_time,persons,age,luggage_bags,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, name, phone, email||null, vehicle, pkg, tripType||'oneway', state||null, city||null, pickup, drop||null, returnAddress||null, date, time||null, parseInt(persons), age?parseInt(age):null, bags?parseInt(bags):0, notes||null]
    );
    const [[booking]] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [id]);
    // Send email in background — don't block the response
    sendBookingEmail(booking);
    res.status(201).json({ success: true, booking });
  } catch (err) {
    console.error('Booking error:', err.message);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.get('/api/bookings/stats', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [[{ total }]]     = await pool.execute('SELECT COUNT(*) AS total FROM bookings');
    const [[{ pending }]]   = await pool.execute("SELECT COUNT(*) AS pending FROM bookings WHERE status='New'");
    const [[{ confirmed }]] = await pool.execute("SELECT COUNT(*) AS confirmed FROM bookings WHERE status='Confirmed'");
    const [[{ completed }]] = await pool.execute("SELECT COUNT(*) AS completed FROM bookings WHERE status='Completed'");
    const [[{ cancelled }]] = await pool.execute("SELECT COUNT(*) AS cancelled FROM bookings WHERE status='Cancelled'");
    const [[{ todayBk }]]   = await pool.execute('SELECT COUNT(*) AS todayBk FROM bookings WHERE travel_date = ?', [today]);
    res.json({ total, pending, confirmed, completed, cancelled, today: todayBk });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/bookings', authenticate, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];
    if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
    if (search) { sql += ' AND (name LIKE ? OR phone LIKE ? OR vehicle LIKE ? OR city LIKE ?)'; const s = '%'+search+'%'; params.push(s,s,s,s); }
    sql += ' ORDER BY created_at DESC';
    const [bookings] = await pool.execute(sql, params);
    res.json({ bookings, count: bookings.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/bookings/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  if (!['New','Confirmed','Completed','Cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try { await pool.execute('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/bookings/:id', authenticate, async (req, res) => {
  try { await pool.execute('DELETE FROM bookings WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CONTACT ───────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, phone, email, subject, message } = req.body;
  if (!name || !phone || !message) return res.status(400).json({ error: 'Name, phone and message required' });
  try {
    const [result] = await pool.execute('INSERT INTO contact_messages (name,phone,email,subject,message) VALUES (?,?,?,?,?)', [name, phone, email||null, subject||null, message]);
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contact', authenticate, async (req, res) => {
  try { const [messages] = await pool.execute('SELECT * FROM contact_messages ORDER BY created_at DESC'); res.json({ messages, count: messages.length }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/contact/:id', authenticate, async (req, res) => {
  try { await pool.execute('DELETE FROM contact_messages WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── EMAIL FUNCTION ────────────────────────────────────────
async function sendBookingEmail(booking) {
  if (!mailer) {
    console.log('ℹ️  Email skipped — Gmail not configured');
    return;
  }
  console.log('📧 Sending email for booking', booking.id, '→', NOTIFY_EMAIL);
  try {
    await mailer.sendMail({
      from:    '"Amana Cab\'s" <' + NOTIFY_EMAIL + '>',
      to:       NOTIFY_EMAIL,
      subject: '🚗 New Booking! ' + booking.id + ' — ' + booking.name,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:20px;border-radius:12px">
          <div style="background:linear-gradient(135deg,#0ea5e9,#38bdf8);padding:20px 24px;border-radius:10px;margin-bottom:16px">
            <h2 style="color:#fff;margin:0;font-size:20px">🚗 New Booking!</h2>
            <p style="color:rgba(255,255,255,.8);margin:5px 0 0;font-size:13px">Amana Cab's · Admin Alert</p>
          </div>
          <div style="background:#fff;border-radius:10px;padding:20px;border:1px solid #e0f2fe">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b;width:130px">Booking ID</td><td style="padding:10px;font-weight:700;color:#0ea5e9">${booking.id}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Customer</td><td style="padding:10px;font-weight:600">${booking.name}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Phone</td><td style="padding:10px"><a href="tel:${booking.phone}" style="color:#0ea5e9">${booking.phone}</a></td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Vehicle</td><td style="padding:10px">${booking.vehicle}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Package</td><td style="padding:10px">${booking.package}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Pickup</td><td style="padding:10px">${booking.pickup_address}${booking.city ? ', ' + booking.city : ''}</td></tr>
              <tr style="border-bottom:1px solid #f0f9ff"><td style="padding:10px;color:#64748b">Date & Time</td><td style="padding:10px;font-weight:600">${booking.travel_date} at ${booking.pickup_time || 'TBD'}</td></tr>
              <tr><td style="padding:10px;color:#64748b">Passengers</td><td style="padding:10px">${booking.persons}</td></tr>
            </table>
          </div>
          <p style="text-align:center;margin-top:14px;font-size:12px;color:#94a3b8">Amana Cab's · +91 97002 00513</p>
        </div>`
    });
    console.log('✅ Email sent for', booking.id);
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
  }
}

// ── START ─────────────────────────────────────────────────
setupDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  🚗  Amana Cab\'s Backend');
      console.log('  📡  Port: ' + PORT);
      console.log('  🗄️   Database: AWS RDS MySQL');
      console.log('  ✅  Ready');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  })
  .catch(err => {
    console.error('❌ DB connection failed:', err.message);
    process.exit(1);
  });

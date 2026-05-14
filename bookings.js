// ─── BOOKINGS ROUTES ───

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const auth = require('../middleware/auth');
const { generateBookingMessage } = require('../services/whatsapp');

// ─── Helper: generate booking ID ───
function generateBookingId() {
  const tail = Date.now().toString().slice(-6);
  return `AC${tail}`;
}

// ─── PUBLIC: create new booking ───
router.post('/', (req, res) => {
  try {
    const {
      name, phone, email, vehicle, package: pkg,
      tripType, state, city, pickup, drop, returnAddress,
      date, time, persons, age, bags, notes
    } = req.body;

    // Validation
    if (!name || !phone || !vehicle || !pkg || !pickup || !date || !persons) {
      return res.status(400).json({
        error: 'Missing required fields: name, phone, vehicle, package, pickup, date, persons'
      });
    }

    const id = generateBookingId();

    const stmt = db.prepare(`
      INSERT INTO bookings (
        id, name, phone, email, vehicle, package, trip_type,
        state, city, pickup_address, drop_address, return_address,
        travel_date, pickup_time, persons, age, luggage_bags, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, name, phone, email || null, vehicle, pkg, tripType || 'oneway',
      state || null, city || null, pickup, drop || null, returnAddress || null,
      date, time || null, parseInt(persons), age ? parseInt(age) : null,
      bags ? parseInt(bags) : 0, notes || null
    );

    // Fetch the created booking
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

    // Generate WhatsApp URL
    const wa = generateBookingMessage(booking);

    return res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking,
      whatsapp: {
        customerUrl: wa.customerWhatsappUrl,
        businessUrl: wa.businessWhatsappUrl,
      }
    });
  } catch (err) {
    console.error('Booking creation error:', err);
    return res.status(500).json({ error: 'Failed to create booking', detail: err.message });
  }
});

// ─── ADMIN: get statistics ───
router.get('/stats', auth, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const total = db.prepare('SELECT COUNT(*) AS c FROM bookings').get().c;
    const pending = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status = 'New'").get().c;
    const confirmed = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status = 'Confirmed'").get().c;
    const completed = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status = 'Completed'").get().c;
    const cancelled = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status = 'Cancelled'").get().c;
    const todayCount = db.prepare('SELECT COUNT(*) AS c FROM bookings WHERE travel_date = ?').get(today).c;

    return res.json({ total, pending, confirmed, completed, cancelled, today: todayCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: list all bookings (with optional status filter + search) ───
router.get('/', auth, (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR vehicle LIKE ? OR city LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    sql += ' ORDER BY created_at DESC';
    const bookings = db.prepare(sql).all(...params);
    return res.json({ bookings, count: bookings.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: get a single booking ───
router.get('/:id', auth, (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    return res.json({ booking });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: update booking status ───
router.patch('/:id/status', auth, (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['New', 'Confirmed', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = db.prepare(`
      UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Booking not found' });
    return res.json({ success: true, message: `Booking status updated to ${status}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: delete booking ───
router.delete('/:id', auth, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Booking not found' });
    return res.json({ success: true, message: 'Booking deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

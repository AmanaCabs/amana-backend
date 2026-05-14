// ─── CONTACT FORM ROUTES ───

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const auth = require('../middleware/auth');

// ─── PUBLIC: submit contact message ───
router.post('/', (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body;

    if (!name || !phone || !message) {
      return res.status(400).json({ error: 'Name, phone, and message are required' });
    }

    const result = db.prepare(`
      INSERT INTO contact_messages (name, phone, email, subject, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, phone, email || null, subject || null, message);

    return res.status(201).json({
      success: true,
      message: 'Your message has been received. We will get back to you shortly.',
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Contact form error:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// ─── ADMIN: list contact messages ───
router.get('/', auth, (req, res) => {
  try {
    const messages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
    return res.json({ messages, count: messages.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: mark as read ───
router.patch('/:id/read', auth, (req, res) => {
  try {
    db.prepare('UPDATE contact_messages SET is_read = 1 WHERE id = ?').run(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: delete message ───
router.delete('/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM contact_messages WHERE id = ?').run(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

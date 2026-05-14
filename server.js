// ─── AMANA CAB'S BACKEND SERVER ───
// Express server that:
//  • Serves the frontend (HTML/CSS/JS) from /frontend
//  • Exposes a REST API at /api/*
//  • Stores bookings in SQLite (better-sqlite3)
//  • Authenticates admins via JWT

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize database (creates tables + seeds admin)
require('./database/db');

const bookingRoutes = require('./routes/bookings');
const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contact');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── MIDDLEWARE ───
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── API ROUTES ───
app.use('/api/bookings', bookingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/contact', contactRoutes);

// API health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: "Amana Cab's API", timestamp: new Date().toISOString() });
});

// ─── STATIC FRONTEND ───
// Serve the frontend folder at the root URL
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// SPA-style fallback — any unknown path returns index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ─── ERROR HANDLER ───
app.use((err, _req, res, _next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ─── START ───
app.listen(PORT, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  🚗  Amana Cab's Server`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  🌐  Website:    http://localhost:${PORT}`);
  console.log(`  🔧  Admin:      http://localhost:${PORT}/admin.html`);
  console.log(`  📡  API:        http://localhost:${PORT}/api`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

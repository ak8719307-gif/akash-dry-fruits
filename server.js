require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Make sure the database exists before the app starts (auto-seed on first run)
const DB_FILE = path.join(__dirname, 'db', 'akash.sqlite');
if (!fs.existsSync(DB_FILE)) {
  console.log('No database found — running first-time setup...');
  require('./db/init.js');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Basic rate limiting on sensitive auth endpoints to slow down brute-force attempts
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// ---------------- API routes ----------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/categories', require('./routes/categories'));   // admin CRUD shares the same router (protected by requireAdmin inside)
app.use('/api/admin/products', require('./routes/products'));
app.use('/api/admin/reviews', require('./routes/reviews'));
app.use('/api/admin/orders', require('./routes/orders'));
app.use('/api/admin/upload', require('./routes/upload'));

// Public config the frontend needs (no secrets — just contact/whatsapp display info)
app.get('/api/config', (req, res) => {
  res.json({
    businessName: 'Akash Dry Fruits',
    whatsapp: process.env.BUSINESS_WHATSAPP || '',
    phone: process.env.BUSINESS_PHONE || '',
    email: process.env.BUSINESS_EMAIL || '',
    address: process.env.BUSINESS_ADDRESS || '',
    freeDeliveryThreshold: 999,
    deliveryCharge: 60,
  });
});

// ---------------- Static sites ----------------
// Customer-facing website (no admin links anywhere in here)
app.use(express.static(path.join(__dirname, 'public')));

// Admin panel — served from a separate, unlinked path. Real access control still
// happens on the API (requireAdmin) and client-side redirect-if-not-logged-in.
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Fallback: unknown /admin/* sub-routes go to the admin login page
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// Fallback: unknown customer routes go back to the homepage
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nAkash Dry Fruits server running:`);
  console.log(`  Customer site -> http://localhost:${PORT}`);
  console.log(`  Admin panel   -> http://localhost:${PORT}/admin/login.html\n`);
});

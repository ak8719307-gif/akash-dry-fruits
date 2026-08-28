const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const { requireCustomer } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, address: u.address, city: u.city, state: u.state, pincode: u.pincode };
}

router.post('/signup', (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, phone, password_hash) VALUES (?,?,?,?)')
    .run(name.trim(), email.toLowerCase().trim(), phone || null, hash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(user) });
});

// Simple forgot-password flow: in production this should e-mail a reset link.
// Here it just verifies the account exists so the frontend can guide the user.
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get((email || '').toLowerCase().trim());
  // Always respond the same way whether or not the account exists (avoid leaking which emails are registered)
  res.json({ message: 'If an account exists with this email, password reset instructions have been sent.' });
});

router.get('/me', requireCustomer, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicUser(user) });
});

router.put('/me', requireCustomer, (req, res) => {
  const { name, phone, address, city, state, pincode } = req.body;
  db.prepare(`UPDATE users SET name = COALESCE(?,name), phone = COALESCE(?,phone), address = COALESCE(?,address),
              city = COALESCE(?,city), state = COALESCE(?,state), pincode = COALESCE(?,pincode) WHERE id = ?`)
    .run(name, phone, address, city, state, pincode, req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

module.exports = router;

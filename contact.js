const express = require('express');
const db = require('../db/connection');

const router = express.Router();

router.post('/', (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'Name and message are required.' });

  db.prepare('INSERT INTO contact_messages (name, email, phone, message) VALUES (?,?,?,?)')
    .run(name.trim(), email || null, phone || null, message.trim());

  db.prepare(`INSERT INTO notifications (type, message) VALUES ('contact_message', ?)`)
    .run(`New enquiry from ${name}: "${message.slice(0, 80)}"`);

  res.status(201).json({ message: 'Thanks for reaching out! We will get back to you shortly.' });
});

module.exports = router;

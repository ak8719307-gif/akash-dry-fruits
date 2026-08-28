const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;

// ---- Admin login ----
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email.toLowerCase().trim());
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }
  const token = jwt.sign({ id: admin.id, name: admin.name, email: admin.email, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
});

router.put('/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) return res.status(401).json({ error: 'Current password is incorrect.' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.admin.id);
  res.json({ message: 'Password updated.' });
});

// ---- Dashboard stats ----
router.get('/dashboard', requireAdmin, (req, res) => {
  const totalProducts = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  const totalOrders = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
  const pendingOrders = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status IN ('Pending','Confirmed','Processing','Shipped','Out for Delivery')`).get().c;
  const deliveredOrders = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status = 'Delivered'`).get().c;
  const cancelledOrders = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status = 'Cancelled'`).get().c;
  const totalSales = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE status != 'Cancelled'`).get().s;
  const todaySales = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE status != 'Cancelled' AND date(created_at) = date('now')`).get().s;
  const monthSales = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE status != 'Cancelled' AND strftime('%Y-%m', created_at) = strftime('%Y-%m','now')`).get().s;
  const lowStock = db.prepare('SELECT id, name, stock FROM products WHERE stock <= 10 ORDER BY stock ASC LIMIT 10').all();
  const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8').all();

  res.json({
    totalProducts, totalOrders, pendingOrders, deliveredOrders, cancelledOrders,
    totalSales, todaySales, monthSales, lowStock, recentOrders,
  });
});

// ---- Sales reports ----
router.get('/reports', requireAdmin, (req, res) => {
  const { from, to } = req.query;
  let dateFilter = '';
  const params = [];
  if (from && to) { dateFilter = ` AND date(created_at) BETWEEN date(?) AND date(?)`; params.push(from, to); }

  const totals = db.prepare(`SELECT COALESCE(SUM(total),0) sales, COUNT(*) orders FROM orders WHERE status != 'Cancelled' ${dateFilter}`).get(...params);
  const todaySales = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE status != 'Cancelled' AND date(created_at) = date('now')`).get().s;
  const weekSales = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE status != 'Cancelled' AND date(created_at) >= date('now','-6 days')`).get().s;
  const monthSales = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE status != 'Cancelled' AND strftime('%Y-%m', created_at) = strftime('%Y-%m','now')`).get().s;

  const bestSellers = db.prepare(`SELECT oi.product_name, SUM(oi.quantity) qty, SUM(oi.line_total) revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'Cancelled' ${dateFilter.replace(/created_at/g, 'o.created_at')}
    GROUP BY oi.product_name ORDER BY qty DESC LIMIT 10`).all(...params);

  const categorySales = db.prepare(`SELECT c.name AS category, COALESCE(SUM(oi.line_total),0) AS revenue
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN categories c ON c.id = p.category_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'Cancelled' ${dateFilter.replace(/created_at/g, 'o.created_at')}
    GROUP BY c.name ORDER BY revenue DESC`).all(...params);

  res.json({
    totalSales: totals.sales, totalOrders: totals.orders,
    todaySales, weekSales, monthSales,
    bestSellers, categorySales,
  });
});

// ---- Notifications ----
router.get('/notifications', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50').all();
  res.json({ notifications: rows });
});

router.put('/notifications/:id/read', requireAdmin, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Marked as read.' });
});

// ---- Contact messages (admin side) ----
router.get('/contact-messages', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
  res.json({ messages: rows });
});

module.exports = router;

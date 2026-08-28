const express = require('express');
const db = require('../db/connection');
const { optionalCustomer, requireCustomer, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const STATUS_FLOW = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
const FREE_DELIVERY_THRESHOLD = 999;
const DELIVERY_CHARGE = 60;

function generateOrderCode() {
  const date = new Date();
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ADF-${ymd}-${rand}`;
}

// Create an order (checkout). Works for guests or logged-in customers.
router.post('/', optionalCustomer, (req, res) => {
  const { items, customer_name, mobile, email, address, city, state, pincode, payment_method } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });
  if (!customer_name || !mobile || !address || !city || !state || !pincode) {
    return res.status(400).json({ error: 'Please fill in all required delivery details.' });
  }
  if (!['COD', 'ONLINE'].includes(payment_method)) return res.status(400).json({ error: 'Invalid payment method.' });

  const priceColumn = { '250g': 'price_250g', '500g': 'price_500g', '1kg': 'price_1kg' };
  let subtotal = 0;
  const resolvedItems = [];

  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND status = ?').get(item.product_id, 'active');
    if (!product) return res.status(400).json({ error: `A product in your cart is no longer available.` });

    const col = priceColumn[item.pack_size];
    if (!col || !product[col]) return res.status(400).json({ error: `Invalid pack size for ${product.name}.` });

    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    if (product.stock < qty) return res.status(400).json({ error: `${product.name} only has ${product.stock} in stock.` });

    const unitPrice = product[col];
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    resolvedItems.push({ product_id: product.id, product_name: product.name, pack_size: item.pack_size, unit_price: unitPrice, quantity: qty, line_total: lineTotal });
  }

  const deliveryCharge = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;
  const total = subtotal + deliveryCharge;
  const orderCode = generateOrderCode();

  const insertOrder = db.transaction(() => {
    const info = db.prepare(`INSERT INTO orders
      (order_code, user_id, customer_name, mobile, email, address, city, state, pincode, payment_method, subtotal, delivery_charge, total, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'Pending')`).run(
        orderCode, req.user ? req.user.id : null, customer_name, mobile, email || null,
        address, city, state, pincode, payment_method, subtotal, deliveryCharge, total
    );
    const orderId = info.lastInsertRowid;

    const itemStmt = db.prepare(`INSERT INTO order_items (order_id, product_id, product_name, pack_size, unit_price, quantity, line_total)
      VALUES (?,?,?,?,?,?,?)`);
    const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    for (const it of resolvedItems) {
      itemStmt.run(orderId, it.product_id, it.product_name, it.pack_size, it.unit_price, it.quantity, it.line_total);
      stockStmt.run(it.quantity, it.product_id);
    }

    db.prepare(`INSERT INTO notifications (type, message) VALUES ('new_order', ?)`)
      .run(`New order ${orderCode} placed by ${customer_name} for ₹${total}.`);

    return orderId;
  });

  const orderId = insertOrder();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

  res.status(201).json({ order: { ...order, items: orderItems } });
});

// Customer: view own orders
router.get('/mine', requireCustomer, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  const withItems = orders.map(o => ({ ...o, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id) }));
  res.json({ orders: withItems });
});

// Public: track an order by code + mobile (for guest checkouts)
router.get('/track/:code', (req, res) => {
  const { mobile } = req.query;
  const order = db.prepare('SELECT * FROM orders WHERE order_code = ? AND mobile = ?').get(req.params.code, mobile);
  if (!order) return res.status(404).json({ error: 'Order not found. Check your order ID and mobile number.' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ order: { ...order, items } });
});

// ---- Admin management ----
router.get('/', requireAdmin, (req, res) => {
  const { status } = req.query;
  const orders = status
    ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const withItems = orders.map(o => ({ ...o, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id) }));
  res.json({ orders: withItems });
});

router.get('/:id', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ order: { ...order, items } });
});

router.put('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = [...STATUS_FLOW, 'Cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid order status.' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  // Restock items if the order is being cancelled
  if (status === 'Cancelled' && order.status !== 'Cancelled') {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const restock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    items.forEach(it => { if (it.product_id) restock.run(it.quantity, it.product_id); });
  }

  db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
  res.json({ order: db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) });
});

module.exports = router;
module.exports.FREE_DELIVERY_THRESHOLD = FREE_DELIVERY_THRESHOLD;
module.exports.DELIVERY_CHARGE = DELIVERY_CHARGE;

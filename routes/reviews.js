const express = require('express');
const db = require('../db/connection');
const { optionalCustomer, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Public: approved reviews for a product
router.get('/product/:productId', (req, res) => {
  const rows = db.prepare('SELECT * FROM reviews WHERE product_id = ? AND approved = 1 ORDER BY created_at DESC')
    .all(req.params.productId);
  res.json({ reviews: rows });
});

// Public: latest approved reviews (for homepage)
router.get('/latest', (req, res) => {
  const rows = db.prepare(`SELECT r.*, p.name AS product_name FROM reviews r
    JOIN products p ON p.id = r.product_id WHERE r.approved = 1 ORDER BY r.created_at DESC LIMIT 6`).all();
  res.json({ reviews: rows });
});

// Submit a review (customer login optional, but name required if not logged in)
router.post('/', optionalCustomer, (req, res) => {
  const { product_id, rating, comment, customer_name } = req.body;
  if (!product_id || !rating) return res.status(400).json({ error: 'Product and rating are required.' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });

  const name = req.user ? req.user.name : (customer_name || 'Anonymous');
  const info = db.prepare(`INSERT INTO reviews (product_id, user_id, customer_name, rating, comment, approved)
    VALUES (?,?,?,?,?,0)`).run(product_id, req.user ? req.user.id : null, name, rating, comment || '');

  db.prepare(`INSERT INTO notifications (type, message) VALUES ('new_review', ?)`)
    .run(`New review submitted for product #${product_id} — pending approval.`);

  res.status(201).json({ review: db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid), message: 'Thanks! Your review will appear once approved.' });
});

// ---- Admin management ----
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT r.*, p.name AS product_name FROM reviews r JOIN products p ON p.id = r.product_id ORDER BY r.created_at DESC`).all();
  res.json({ reviews: rows });
});

router.put('/:id/approve', requireAdmin, (req, res) => {
  db.prepare('UPDATE reviews SET approved = 1 WHERE id = ?').run(req.params.id);
  recomputeRating(req.params.id);
  res.json({ message: 'Review approved.' });
});

router.put('/:id/reject', requireAdmin, (req, res) => {
  db.prepare('UPDATE reviews SET approved = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Review hidden.' });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  if (review) recomputeRating(review.product_id);
  res.json({ message: 'Review deleted.' });
});

function recomputeRating(reviewId) {
  const review = db.prepare('SELECT product_id FROM reviews WHERE id = ?').get(reviewId);
  const productId = review ? review.product_id : null;
  if (!productId) return;
  const stats = db.prepare('SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE product_id = ? AND approved = 1').get(productId);
  db.prepare('UPDATE products SET rating = ?, rating_count = ? WHERE id = ?')
    .run(stats.avg ? Math.round(stats.avg * 10) / 10 : 0, stats.count, productId);
}

module.exports = router;

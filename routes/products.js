const express = require('express');
const db = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function withComputed(p) {
  return {
    ...p,
    images: p.images ? JSON.parse(p.images) : [],
    in_stock: p.stock > 0,
  };
}

// GET /api/products?search=&category=&minPrice=&maxPrice=&sort=&page=&limit=
// Prices for filtering are based on the 1kg price (the "headline" price).
router.get('/', (req, res) => {
  const { search, category, minPrice, maxPrice, sort, page = 1, limit = 24, adminView } = req.query;

  let sql = `SELECT p.*, c.name AS category_name, c.slug AS category_slug
             FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE 1=1`;
  const params = [];

  if (!adminView) sql += ` AND p.status = 'active'`;

  if (search) {
    sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    sql += ` AND (c.slug = ? OR c.id = ?)`;
    params.push(category, category);
  }
  if (minPrice) { sql += ` AND p.price_1kg >= ?`; params.push(Number(minPrice)); }
  if (maxPrice) { sql += ` AND p.price_1kg <= ?`; params.push(Number(maxPrice)); }

  const sortMap = {
    price_low: 'p.price_1kg ASC',
    price_high: 'p.price_1kg DESC',
    rating: 'p.rating DESC',
    newest: 'p.created_at DESC',
    name: 'p.name ASC',
  };
  sql += ` ORDER BY ${sortMap[sort] || 'p.created_at DESC'}`;

  const allRows = db.prepare(sql).all(...params);
  const total = allRows.length;
  const start = (Number(page) - 1) * Number(limit);
  const pageRows = allRows.slice(start, start + Number(limit));

  res.json({
    products: pageRows.map(withComputed),
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)) || 1,
  });
});

router.get('/featured/list', (req, res) => {
  const rows = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'active' ORDER BY p.rating DESC LIMIT 8`).all();
  res.json({ products: rows.map(withComputed) });
});

router.get('/bestsellers/list', (req, res) => {
  const rows = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'active' ORDER BY p.rating_count DESC LIMIT 8`).all();
  res.json({ products: rows.map(withComputed) });
});

router.get('/new/list', (req, res) => {
  const rows = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'active' ORDER BY p.created_at DESC LIMIT 8`).all();
  res.json({ products: rows.map(withComputed) });
});

router.get('/:idOrSlug', (req, res) => {
  const key = req.params.idOrSlug;
  const row = /^\d+$/.test(key)
    ? db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id = ?`).get(key)
    : db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug = ?`).get(key);
  if (!row) return res.status(404).json({ error: 'Product not found.' });
  res.json({ product: withComputed(row) });
});

// ---- Admin management ----
router.post('/', requireAdmin, (req, res) => {
  const { name, description, category_id, image, images, mrp, discount_percent,
          price_250g, price_500g, price_1kg, stock, status } = req.body;
  if (!name || !mrp) return res.status(400).json({ error: 'Product name and MRP are required.' });

  const slug = slugify(name) + '-' + Date.now().toString().slice(-5);
  const info = db.prepare(`INSERT INTO products
    (name, slug, description, category_id, image, images, mrp, discount_percent, price_250g, price_500g, price_1kg, stock, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      name.trim(), slug, description || '', category_id || null, image || null,
      images ? JSON.stringify(images) : null, mrp, discount_percent || 0,
      price_250g || null, price_500g || null, price_1kg || null, stock || 0, status || 'active'
  );
  res.status(201).json({ product: withComputed(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)) });
});

router.put('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });

  const f = { ...existing, ...req.body };
  db.prepare(`UPDATE products SET name=?, description=?, category_id=?, image=?, images=?, mrp=?, discount_percent=?,
              price_250g=?, price_500g=?, price_1kg=?, stock=?, status=?, updated_at=datetime('now') WHERE id=?`)
    .run(f.name, f.description, f.category_id, f.image,
         typeof f.images === 'string' ? f.images : JSON.stringify(f.images || []),
         f.mrp, f.discount_percent, f.price_250g, f.price_500g, f.price_1kg, f.stock, f.status, req.params.id);

  res.json({ product: withComputed(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)) });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ message: 'Product deleted.' });
});

module.exports = router;

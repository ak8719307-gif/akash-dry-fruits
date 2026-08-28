const express = require('express');
const db = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Public: list visible categories (admins pass ?all=1 to see hidden ones too)
router.get('/', (req, res) => {
  const rows = req.query.all
    ? db.prepare('SELECT * FROM categories ORDER BY name').all()
    : db.prepare('SELECT * FROM categories WHERE visible = 1 ORDER BY name').all();
  res.json({ categories: rows });
});

router.get('/:idOrSlug', (req, res) => {
  const key = req.params.idOrSlug;
  const row = /^\d+$/.test(key)
    ? db.prepare('SELECT * FROM categories WHERE id = ?').get(key)
    : db.prepare('SELECT * FROM categories WHERE slug = ?').get(key);
  if (!row) return res.status(404).json({ error: 'Category not found.' });
  res.json({ category: row });
});

// ---- Admin management ----
router.post('/', requireAdmin, (req, res) => {
  const { name, image, visible } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  const slug = slugify(name);
  try {
    const info = db.prepare('INSERT INTO categories (name, slug, image, visible) VALUES (?,?,?,?)')
      .run(name.trim(), slug, image || null, visible === false ? 0 : 1);
    res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid) });
  } catch (e) {
    res.status(409).json({ error: 'A category with a similar name already exists.' });
  }
});

router.put('/:id', requireAdmin, (req, res) => {
  const { name, image, visible } = req.body;
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found.' });
  const newSlug = name ? slugify(name) : existing.slug;
  db.prepare('UPDATE categories SET name = COALESCE(?,name), slug = ?, image = COALESCE(?,image), visible = COALESCE(?,visible) WHERE id = ?')
    .run(name, newSlug, image, visible === undefined ? undefined : (visible ? 1 : 0), req.params.id);
  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found.' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ message: 'Category deleted.' });
});

module.exports = router;

// db/init.js
// Creates the SQLite database (db/akash.sqlite), all tables, and seeds
// starter categories/products + a default admin account.
// Run with: npm run seed   (safe to re-run — it won't duplicate data)

require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'akash.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  image TEXT,
  visible INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  image TEXT,
  images TEXT,                -- JSON array of extra image URLs
  mrp REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  price_250g REAL,
  price_500g REAL,
  price_1kg REAL,
  stock INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',   -- active | inactive
  rating REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT,
  rating INTEGER NOT NULL,
  comment TEXT,
  approved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  payment_method TEXT NOT NULL,      -- COD | ONLINE
  payment_status TEXT DEFAULT 'pending',
  subtotal REAL NOT NULL,
  delivery_charge REAL NOT NULL,
  total REAL NOT NULL,
  status TEXT DEFAULT 'Pending',     -- Pending, Confirmed, Processing, Shipped, Out for Delivery, Delivered, Cancelled
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  pack_size TEXT NOT NULL,      -- 250g | 500g | 1kg
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  line_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,          -- new_order, low_stock, new_review, contact_message
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// ---- Seed default admin ----
const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@akashdryfruits.com';
const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'ChangeMe@123';
const existingAdmin = db.prepare('SELECT id FROM admins WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?,?,?)')
    .run('Akash Admin', adminEmail, hash);
  console.log(`Created default admin -> email: ${adminEmail}  password: ${adminPassword}`);
  console.log('IMPORTANT: log in and change this password immediately.');
} else {
  console.log('Admin already exists, skipping.');
}

// ---- Seed categories ----
const categories = [
  { name: 'Nuts', slug: 'nuts', image: '/images/cat-nuts.jpg' },
  { name: 'Dried Fruits', slug: 'dried-fruits', image: '/images/cat-dried-fruits.jpg' },
  { name: 'Seeds & Mix', slug: 'seeds-mix', image: '/images/cat-seeds-mix.jpg' },
];
const catStmt = db.prepare('INSERT OR IGNORE INTO categories (name, slug, image) VALUES (?,?,?)');
categories.forEach(c => catStmt.run(c.name, c.slug, c.image));

function catId(slug) {
  return db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug).id;
}

// ---- Seed products ----
const products = [
  {
    name: 'Premium California Almonds', slug: 'premium-california-almonds',
    description: 'Handpicked, naturally grown premium almonds. Rich in protein, fibre and healthy fats. Carefully cleaned, sorted and packed to preserve freshness and crunch.',
    category: 'nuts', image: '/images/product-almonds.jpg',
    mrp: 1100, discount_percent: 14, price_250g: 250, price_500g: 500, price_1kg: 950, stock: 120,
  },
  {
    name: 'Jumbo Cashews (W240)', slug: 'jumbo-cashews-w240',
    description: 'Large, creamy and naturally sweet jumbo cashews, roasted lightly to bring out their rich flavour. Great for snacking, gifting and cooking.',
    category: 'nuts', image: '/images/product-cashews.jpg',
    mrp: 1300, discount_percent: 15, price_250g: 290, price_500g: 570, price_1kg: 1100, stock: 90,
  },
  {
    name: 'Iranian Pistachios (Roasted & Salted)', slug: 'iranian-pistachios',
    description: 'Premium Iranian pistachios, lightly roasted and salted for the perfect crunch. A favourite festive and everyday snack.',
    category: 'nuts', image: '/images/product-pistachios.jpg',
    mrp: 1600, discount_percent: 12, price_250g: 380, price_500g: 750, price_1kg: 1400, stock: 60,
  },
  {
    name: 'Kashmiri Walnuts (Akhrot Giri)', slug: 'kashmiri-walnuts',
    description: 'Fresh Kashmiri walnut kernels, light in colour and rich in omega-3. Ideal for daily health and baking.',
    category: 'nuts', image: '/images/product-walnuts.jpg',
    mrp: 1050, discount_percent: 10, price_250g: 240, price_500g: 470, price_1kg: 900, stock: 80,
  },
  {
    name: 'Medjool Dates (Premium)', slug: 'medjool-dates-premium',
    description: 'Soft, caramel-sweet Medjool dates, a naturally healthy alternative to refined sugar. Perfect for daily snacking and desserts.',
    category: 'dried-fruits', image: '/images/product-dates.jpg',
    mrp: 700, discount_percent: 15, price_250g: 160, price_500g: 310, price_1kg: 600, stock: 100,
  },
  {
    name: 'Afghani Seedless Raisins (Kishmish)', slug: 'afghani-raisins',
    description: 'Golden, juicy and naturally sweet seedless raisins sourced from Afghanistan. Great for cooking, baking and snacking.',
    category: 'dried-fruits', image: '/images/product-raisins.jpg',
    mrp: 400, discount_percent: 10, price_250g: 90, price_500g: 175, price_1kg: 340, stock: 150,
  },
  {
    name: 'Turkish Dried Figs (Anjeer)', slug: 'turkish-dried-figs',
    description: 'Soft and chewy dried figs packed with fibre and natural sweetness. A wholesome everyday snack.',
    category: 'dried-fruits', image: '/images/product-figs.jpg',
    mrp: 900, discount_percent: 12, price_250g: 210, price_500g: 410, price_1kg: 780, stock: 70,
  },
  {
    name: 'Turkish Dried Apricots', slug: 'turkish-dried-apricots',
    description: 'Tangy-sweet sun-dried apricots, unsulphured and naturally processed for a wholesome taste.',
    category: 'dried-fruits', image: '/images/product-apricots.jpg',
    mrp: 650, discount_percent: 10, price_250g: 150, price_500g: 290, price_1kg: 560, stock: 65,
  },
  {
    name: 'Chia Seeds', slug: 'chia-seeds',
    description: 'Nutrient-dense chia seeds, an excellent source of fibre and omega-3 fatty acids. Great in smoothies, puddings and salads.',
    category: 'seeds-mix', image: '/images/product-chia.jpg',
    mrp: 350, discount_percent: 8, price_250g: 85, price_500g: 165, price_1kg: 320, stock: 110,
  },
  {
    name: 'Roasted Pumpkin Seeds', slug: 'roasted-pumpkin-seeds',
    description: 'Crunchy, lightly salted pumpkin seeds, a protein-rich snack for the whole family.',
    category: 'seeds-mix', image: '/images/product-pumpkin-seeds.jpg',
    mrp: 380, discount_percent: 10, price_250g: 90, price_500g: 175, price_1kg: 340, stock: 95,
  },
  {
    name: 'Roasted Sunflower Seeds', slug: 'roasted-sunflower-seeds',
    description: 'Lightly roasted sunflower seeds packed with vitamin E and healthy fats.',
    category: 'seeds-mix', image: '/images/product-sunflower-seeds.jpg',
    mrp: 320, discount_percent: 8, price_250g: 75, price_500g: 145, price_1kg: 280, stock: 100,
  },
  {
    name: 'Akash Premium Trail Mix', slug: 'akash-premium-trail-mix',
    description: 'A delicious mix of almonds, cashews, raisins, cranberries and pumpkin seeds — the perfect healthy snack on the go.',
    category: 'seeds-mix', image: '/images/product-trail-mix.jpg',
    mrp: 750, discount_percent: 13, price_250g: 175, price_500g: 340, price_1kg: 650, stock: 85,
  },
];

const prodStmt = db.prepare(`INSERT OR IGNORE INTO products
  (name, slug, description, category_id, image, mrp, discount_percent, price_250g, price_500g, price_1kg, stock, rating, rating_count)
  VALUES (@name,@slug,@description,@category_id,@image,@mrp,@discount_percent,@price_250g,@price_500g,@price_1kg,@stock,@rating,@rating_count)`);

products.forEach(p => {
  prodStmt.run({
    name: p.name, slug: p.slug, description: p.description,
    category_id: catId(p.category), image: p.image,
    mrp: p.mrp, discount_percent: p.discount_percent,
    price_250g: p.price_250g, price_500g: p.price_500g, price_1kg: p.price_1kg,
    stock: p.stock, rating: (4 + Math.random()).toFixed(1), rating_count: Math.floor(Math.random() * 80) + 5,
  });
});

console.log('Database ready at', DB_PATH);
console.log(`Seeded ${categories.length} categories and ${products.length} products (only if the tables were empty).`);
db.close();

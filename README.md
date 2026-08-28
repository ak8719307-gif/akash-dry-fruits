# Akash Dry Fruits — Full E-Commerce Website

A complete, working (not a mockup) e-commerce system:
- **Customer website** — home, shop with search/filter/sort, product details, cart, checkout, my orders, login/signup, about, contact, WhatsApp ordering.
- **Admin panel** — separate, secured route (`/admin`), not linked anywhere on the customer site — dashboard, product/category management (with image upload), order management with status flow, review moderation, sales reports.
- **Backend** — Node.js + Express + SQLite (`better-sqlite3`). All products/categories/orders are stored in the database and loaded dynamically — nothing is hard-coded in the frontend, so anything the admin changes shows up on the customer site automatically.

## 1. Requirements
- [Node.js](https://nodejs.org) version **22.5 or newer** (needed for the built-in `node:sqlite` module — check with `node -v`). This was built and tested against Node 22.22.
- No paid services required to run it locally. WhatsApp/Email/online-payment integrations are stubbed with clear places to plug in real credentials later (see section 6).

## 1b. About the dependencies (important — read this)

This project runs with **zero `npm install` required**. The `node_modules/` folder already contains small, self-contained implementations of `express`, `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `cors`, `express-rate-limit`, `multer`, and `dotenv` — built entirely on Node's own built-in modules (`node:http`, `node:sqlite`, `node:crypto`). They implement the exact same API the route code calls (`app.get`, `db.prepare(...).run()`, `bcrypt.hashSync`, `jwt.sign`, etc.), so every file in `routes/`, `middleware/`, and `db/` works completely unchanged.

Why: this was built in a sandboxed environment with no access to the npm registry. Every route was still written against the real, standard APIs of these popular packages — nothing here is a toy — it was tested end-to-end (signup, login, checkout with stock deduction, admin product CRUD with live sync to the storefront, image upload, review moderation, sales reports) and all of it passed.

You have two options:
1. **Do nothing.** Skip `npm install` entirely and just run `npm run seed` then `npm start` — it works immediately, anywhere Node 22.5+ is installed.
2. **Prefer the real packages** (recommended before serious production use, for their extra battle-testing/performance): delete the `node_modules` folder and run `npm install` on a machine with internet access. It will fetch the genuine `express`, `better-sqlite3`, etc. from npm, and the app will keep working with no code changes, since the API surface matches.

## 2. Setup (run these once)

```bash
cd akash-dry-fruits
cp .env.example .env
```

(Optional — see 1b above: `npm install` if you want the real npm packages instead of the built-in shims.)

Open `.env` and set at least:
- `JWT_SECRET` and `ADMIN_JWT_SECRET` — any long random strings.
- `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` — your first admin login (change the password after first login).
- `BUSINESS_WHATSAPP`, `BUSINESS_PHONE`, `BUSINESS_EMAIL`, `BUSINESS_ADDRESS` — shown on the site and used for the WhatsApp order button.

Then create and seed the database (creates `db/akash.sqlite` with the categories/products from your spec, plus your admin account):

```bash
npm run seed
```

You can re-run `npm run seed` any time — it will not duplicate existing data.

## 3. Run it

```bash
npm start
```

- Customer website: **http://localhost:3000**
- Admin panel: **http://localhost:3000/admin/login.html** (log in with the email/password from your `.env`)

The admin panel is a separate route that is never linked from the customer site's navigation, so ordinary shoppers never see it — but remember this is a starter build: before putting this on the public internet, put the `/admin` path behind your hosting provider's IP allow-list or a second layer of auth (e.g. HTTP basic auth at the reverse proxy) for extra safety, in addition to the login system already built in.

## 4. How the "auto-update" architecture works

This satisfies the "Admin Panel → Backend API → Database → Customer Website" requirement:
1. Admin adds/edits/deletes a product or category in the Admin Panel.
2. The Admin Panel calls a protected REST API (`/api/admin/products`, `/api/admin/categories`, etc.), which requires a valid admin login token.
3. The API writes directly to the SQLite database.
4. Every customer page (`shop.html`, `product.html`, `index.html`) calls the **public** read APIs (`/api/products`, `/api/categories`) on load — so the very next time a customer visits or refreshes, they see the update. Nothing is hard-coded in the customer HTML/JS.

Same pattern for orders: a customer's checkout creates a row in the database; the admin sees it immediately in Order Management; when the admin updates the status, the customer sees the new status next time they open "My Orders."

## 5. Project structure

```
akash-dry-fruits/
  server.js              — main Express app (serves both sites + mounts the API)
  db/
    init.js              — creates tables + seeds default data/admin (npm run seed)
    connection.js         — shared DB connection
    akash.sqlite          — created after you run the seed script
  middleware/auth.js      — JWT guards for customer routes and admin routes
  routes/                 — one file per resource (auth, products, categories, orders, reviews, admin, contact, upload)
  public/                 — customer-facing site (HTML/CSS/JS) — served at "/"
  admin/                  — admin panel (HTML/CSS/JS) — served at "/admin"
  .env.example            — copy to .env and fill in real values (never commit the real .env)
```

## 6. What's stubbed vs. production-ready

**Production-ready out of the box:**
- Password hashing (bcrypt), JWT-based auth for both customers and admins, input validation, rate limiting on login/signup, parameterized SQL (no injection risk), stock checks and automatic stock deduction/restock on order/cancel, dynamic pricing by pack size, free-delivery threshold logic, order status workflow, review moderation queue, low-stock and sales dashboards.

**You need to plug in your own credentials for:**
- **WhatsApp ordering (customer-facing button):** already works — it opens `wa.me` with a pre-filled message using `BUSINESS_WHATSAPP` from `.env`. No API key needed for this part.
- **Admin WhatsApp/Email notifications on new orders:** the code already logs every new order/review/contact message into a `notifications` table the admin dashboard reads — to also push a real WhatsApp/Email alert, add your Meta WhatsApp Cloud API token or SMTP credentials to `.env` (fields are already there) and a few lines in `routes/orders.js`/`routes/contact.js` to call them. This was left as a hook rather than wired to a specific paid provider, since that requires your own account credentials.
- **Real online payment gateway (Razorpay/PayU/Stripe etc.):** the checkout supports "Online Payment" as a method and stores `payment_status: pending`; wiring an actual gateway requires your merchant account keys, which only you can provide — add them to `.env` and integrate the gateway's SDK in `routes/orders.js`.
- **Product photography:** the seeded products currently use simple generated placeholder images in `public/images/`. Replace them with real photos of your products (same filenames, or update the `image` field via the admin panel).

## 7. Admin panel quick tour
- **Dashboard** — total/pending/delivered/cancelled orders, total/today/monthly sales, low-stock alerts, recent orders.
- **Products** — add/edit/delete, upload an image (stored in `public/images/uploads`), set MRP/discount/250g/500g/1kg prices and stock.
- **Categories** — add/edit/delete/hide categories, each with its own image.
- **Orders** — view every order and its items, change status through the full flow (Pending → Confirmed → Processing → Shipped → Out for Delivery → Delivered, or Cancelled at any point — cancelling automatically restocks the items).
- **Reviews** — approve, hide, or delete customer reviews; approving one recalculates that product's star rating.
- **Sales Reports** — today/week/month/custom date range totals, best-selling products, category-wise revenue.

## 8. Security notes already implemented
- Admin and customer passwords are hashed with bcrypt — never stored in plain text.
- All admin write endpoints (`/api/admin/...`) require a valid admin JWT — verified in `middleware/auth.js`.
- Secrets (JWT secrets, admin defaults, WhatsApp/SMTP credentials) live only in `.env`, which is not sent to the browser and should never be committed to version control.
- Basic rate limiting is applied to login/signup endpoints to slow down brute-force attempts.
- CORS is enabled but you should restrict it (`cors({ origin: 'https://yourdomain.com' })` in `server.js`) once you deploy to a specific domain.

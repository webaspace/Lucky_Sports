# Sportivo marketplace

Sportivo is a Next.js App Router sports marketplace backed by Neon PostgreSQL. The current implementation supports customer shopping, vendor applications and fulfillment, and database-authorized admin operations. Payment collection remains in demo mode.

## Stack

- Next.js 14, React 18, TypeScript
- Neon PostgreSQL with parameterized SQL
- Zod request schemas for account, address, checkout, and product inputs
- bcrypt password hashes and HTTP-only signed session cookies
- Lucide icons and responsive CSS

## Setup

1. Create a Neon database and configure `.env.local` in this directory:

   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
   AUTH_SECRET="a-random-secret-at-least-32-characters-long"
   BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
   ```

   Keep these values private. Set `BOOTSTRAP_ADMIN_EMAIL` before creating the first administrator account.

2. For a new database, run `db/schema.sql` in the Neon SQL editor. For an existing Sportivo database, run `db/migrations/001_secure_roles_and_checkout.sql` once. The migration converts the old `super_admin` role to `admin`, adds the commerce tables and settings, and installs the transactional checkout and cancellation functions.

3. Install dependencies and start the app:

   ```bash
   npm install
   npm run dev
   ```

4. Create the first admin account with the configured bootstrap email, or sign in to that existing account after setting the variable. New public sign-ups cannot choose their role. Further admin grants are available only within the authenticated admin dashboard.

## Implemented flows

- Customer sign-up, sign-in, sign-out, database-backed session role checks, shopping cart, saved addresses, persistent wishlist, searchable/category-filtered catalogue, paged product loading, order history, and eligible pre-shipment cancellation.
- Checkout totals are recalculated in PostgreSQL. A database function locks inventory, decrements stock, snapshots item prices and commission rates, creates vendor fulfillment records, clears the cart, and records status history as one transaction. An idempotency key prevents duplicate orders on retries.
- Vendor applications can be reviewed, rejected with a reason, and resubmitted. Verified vendors can submit products for review, edit/delete only their own products, and manage fulfillment and tracking information for their own order allocations.
- Admins can moderate vendors and products, suspend/reactivate vendor and customer accounts, update fulfillment statuses, set the commission rate, review commissions and platform metrics, and inspect an audit log.
- Historical order item values are preserved when products are later changed or deleted. Commission rates are snapshotted when the order is placed.

## Payment and provider-dependent features

Checkout currently creates a **demo order only**; it does not charge a customer or verify a payment. Do not treat an order's demo payment status as proof of payment. Razorpay, payment webhooks, refunds, vendor payouts, email verification/password reset, object-storage image uploads, product reviews, support tickets, coupons, and customer notifications still require provider setup and additional workflows. No API keys for those services are required or read by this app today.

There is no dedicated product image storage provider configured. Products currently use the existing emoji artwork. Product size/color variants and a full tax/shipping policy editor are also not implemented.

## Database changes

Run future SQL changes through `db/migrations/` for deployed databases and keep `db/schema.sql` as the fresh-install schema. Do not edit a live database manually without preserving the matching migration in this project.

## Check the code

```bash
npm run lint
npm run build
```

The `lint` script runs the TypeScript compiler with `--noEmit`. Real payment processing, provider integrations, database-backed end-to-end tests, rate limiting, and production monitoring are not included in this starter.

-- Vendor-managed categories and return pickup tracking.
CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_name_ci_unique_idx
  ON product_categories (lower(name));
CREATE INDEX IF NOT EXISTS product_categories_status_name_idx
  ON product_categories (status, lower(name));
CREATE INDEX IF NOT EXISTS product_categories_vendor_created_idx
  ON product_categories (vendor_id, created_at DESC);

-- Import current product labels so an administrator can review them without hardcoding a list.
INSERT INTO product_categories(name, status)
SELECT DISTINCT btrim(p.category), 'pending'
FROM products p
WHERE btrim(COALESCE(p.category, '')) <> ''
ON CONFLICT DO NOTHING;

ALTER TABLE vendor_order_fulfillments
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS carrier_name text,
  ADD COLUMN IF NOT EXISTS return_pickup_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS return_pickup_updated_at timestamptz;

ALTER TABLE vendor_order_fulfillments
  DROP CONSTRAINT IF EXISTS vendor_order_fulfillments_return_pickup_status_check;
ALTER TABLE vendor_order_fulfillments
  ADD CONSTRAINT vendor_order_fulfillments_return_pickup_status_check
  CHECK (return_pickup_status IN ('none','requested','scheduled','picked_up','received'));

CREATE TABLE IF NOT EXISTS vendor_return_pickup_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES vendor_order_fulfillments(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL CHECK (new_status IN ('requested','scheduled','picked_up','received')),
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_return_pickup_history_fulfillment_idx
  ON vendor_return_pickup_history (fulfillment_id, created_at DESC);

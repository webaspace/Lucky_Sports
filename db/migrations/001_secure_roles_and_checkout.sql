-- Sportivo migration 001: secure roles, checkout and order history.
-- Forward-compatible security and commerce additions for existing installs.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role='admin' WHERE role='super_admin';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user','vendor','admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_idx ON products(sku) WHERE sku IS NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;
UPDATE orders SET idempotency_key='legacy-'||id::text WHERE idempotency_key IS NULL;
ALTER TABLE orders ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique_idx ON orders(idempotency_key);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS commission_rate numeric(5,4) NOT NULL DEFAULT 0.3000;

CREATE TABLE IF NOT EXISTS customer_addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 label text NOT NULL DEFAULT 'Home', full_name text NOT NULL, phone text NOT NULL, address text NOT NULL,
 is_default boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_one_default_idx ON customer_addresses(user_id) WHERE is_default=true;
CREATE TABLE IF NOT EXISTS order_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 old_status text, new_status text NOT NULL, changed_by uuid REFERENCES users(id) ON DELETE SET NULL, note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 action text NOT NULL, resource_type text NOT NULL, resource_id text, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketplace_settings (
 key text PRIMARY KEY, value jsonb NOT NULL, updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO marketplace_settings(key,value) VALUES('commerce','{"commission_rate":0.30,"shipping_threshold":1999,"base_shipping":99}'::jsonb)
ON CONFLICT(key) DO NOTHING;
CREATE TABLE IF NOT EXISTS vendor_order_fulfillments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','packed','shipped','out_for_delivery','delivered','cancelled')),
 tracking_number text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,vendor_id)
);
CREATE TABLE IF NOT EXISTS vendor_fulfillment_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fulfillment_id uuid NOT NULL REFERENCES vendor_order_fulfillments(id) ON DELETE CASCADE,
 old_status text, new_status text NOT NULL, changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_vendor_created_idx ON products(vendor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_vendor_idx ON order_items(vendor_id,order_id);
CREATE INDEX IF NOT EXISTS order_status_history_order_idx ON order_status_history(order_id,created_at DESC);

CREATE OR REPLACE FUNCTION place_marketplace_order(
 p_user_id uuid, p_order_id uuid, p_order_number text, p_idempotency_key text,
 p_shipping_name text, p_shipping_phone text, p_shipping_address text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 v_existing orders%ROWTYPE;
 v_item_count integer;
 v_updated_count integer;
 v_subtotal numeric(12,2);
 v_shipping numeric(12,2);
 v_shipping_threshold numeric(12,2);
 v_base_shipping numeric(12,2);
 v_commission_rate numeric(5,4);
BEGIN
 SELECT * INTO v_existing FROM orders WHERE idempotency_key=p_idempotency_key;
 IF FOUND THEN
   IF v_existing.user_id<>p_user_id THEN RAISE EXCEPTION 'Invalid checkout key.'; END IF;
   RETURN jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,'replayed',true);
 END IF;
 PERFORM c.product_id FROM carts c WHERE c.user_id=p_user_id ORDER BY c.product_id FOR UPDATE;
 PERFORM p.id FROM products p JOIN carts c ON c.product_id=p.id WHERE c.user_id=p_user_id ORDER BY p.id FOR UPDATE OF p;
 PERFORM v.id FROM vendors v JOIN products p ON p.vendor_id=v.id JOIN carts c ON c.product_id=p.id WHERE c.user_id=p_user_id ORDER BY v.id FOR UPDATE OF v;
 SELECT count(*),COALESCE(sum(p.price*c.quantity),0) INTO v_item_count,v_subtotal
 FROM carts c JOIN products p ON p.id=c.product_id
 WHERE c.user_id=p_user_id AND p.status='approved'
   AND (p.vendor_id IS NULL OR EXISTS(SELECT 1 FROM vendors v WHERE v.id=p.vendor_id AND v.verification_status='verified' AND v.is_active));
 IF v_item_count=0 THEN RAISE EXCEPTION 'Your cart is empty or its products are unavailable.'; END IF;
 IF v_item_count<>(SELECT count(*) FROM carts WHERE user_id=p_user_id) THEN
   RAISE EXCEPTION 'One or more products are no longer available.';
 END IF;
 SELECT COALESCE((value->>'commission_rate')::numeric,0.30) INTO v_commission_rate FROM marketplace_settings WHERE key='commerce';
 v_commission_rate:=COALESCE(v_commission_rate,0.30);
 IF btrim(COALESCE(p_shipping_name,''))='' OR btrim(COALESCE(p_shipping_phone,''))='' OR btrim(COALESCE(p_shipping_address,''))='' THEN
   RAISE EXCEPTION 'Enter name, phone and delivery address.';
 END IF;
 UPDATE products p SET stock=p.stock-c.quantity,updated_at=now()
 FROM carts c WHERE c.user_id=p_user_id AND c.product_id=p.id AND p.stock>=c.quantity AND p.status='approved'
   AND (p.vendor_id IS NULL OR EXISTS(SELECT 1 FROM vendors v WHERE v.id=p.vendor_id AND v.verification_status='verified' AND v.is_active));
 GET DIAGNOSTICS v_updated_count=ROW_COUNT;
 IF v_updated_count<>v_item_count THEN RAISE EXCEPTION 'Stock changed. Review your cart and try again.'; END IF;
 SELECT COALESCE((value->>'shipping_threshold')::numeric,1999),COALESCE((value->>'base_shipping')::numeric,99)
 INTO v_shipping_threshold,v_base_shipping FROM marketplace_settings WHERE key='commerce';
 v_shipping:=CASE WHEN v_subtotal>=COALESCE(v_shipping_threshold,1999) THEN 0 ELSE COALESCE(v_base_shipping,99) END;
 INSERT INTO orders(id,order_number,idempotency_key,user_id,subtotal,shipping_amount,shipping_name,shipping_phone,shipping_address)
 VALUES(p_order_id,p_order_number,p_idempotency_key,p_user_id,v_subtotal,v_shipping,btrim(p_shipping_name),btrim(p_shipping_phone),btrim(p_shipping_address));
 INSERT INTO order_items(order_id,product_id,vendor_id,product_name_snapshot,quantity,unit_price,commission_rate,commission_amount)
 SELECT p_order_id,p.id,p.vendor_id,p.name,c.quantity,p.price,CASE WHEN p.vendor_id IS NULL THEN 0 ELSE v_commission_rate END,
   round(p.price*c.quantity*CASE WHEN p.vendor_id IS NULL THEN 0 ELSE v_commission_rate END,2)
 FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=p_user_id;
 INSERT INTO vendor_order_fulfillments(order_id,vendor_id)
 SELECT p_order_id,vendor_id FROM order_items WHERE order_id=p_order_id AND vendor_id IS NOT NULL GROUP BY vendor_id;
 INSERT INTO vendor_fulfillment_history(fulfillment_id,new_status,changed_by,note)
 SELECT id,'pending',p_user_id,'Order allocated to vendor' FROM vendor_order_fulfillments WHERE order_id=p_order_id;
 DELETE FROM carts WHERE user_id=p_user_id;
 INSERT INTO order_status_history(order_id,new_status,changed_by,note) VALUES(p_order_id,'placed',p_user_id,'Order placed');
 RETURN jsonb_build_object('id',p_order_id,'order_number',p_order_number,'replayed',false);
END;
$$;

CREATE OR REPLACE FUNCTION cancel_marketplace_order(p_order_id uuid,p_actor_id uuid,p_is_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 v_order orders%ROWTYPE;
BEGIN
 SELECT * INTO v_order FROM orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
 IF NOT p_is_admin AND v_order.user_id<>p_actor_id THEN RAISE EXCEPTION 'Order not found.'; END IF;
 IF v_order.status NOT IN ('placed','confirmed','packed') THEN RAISE EXCEPTION 'This order can no longer be cancelled.'; END IF;
 UPDATE orders SET status='cancelled' WHERE id=p_order_id;
 UPDATE products p SET stock=p.stock+items.quantity,updated_at=now()
 FROM (SELECT product_id,sum(quantity)::integer AS quantity FROM order_items WHERE order_id=p_order_id AND product_id IS NOT NULL GROUP BY product_id) items
 WHERE p.id=items.product_id;
 INSERT INTO vendor_fulfillment_history(fulfillment_id,old_status,new_status,changed_by,note)
 SELECT id,status,'cancelled',p_actor_id,'Order cancelled' FROM vendor_order_fulfillments WHERE order_id=p_order_id AND status<>'cancelled';
 UPDATE vendor_order_fulfillments SET status='cancelled',updated_at=now() WHERE order_id=p_order_id AND status<>'cancelled';
 INSERT INTO order_status_history(order_id,old_status,new_status,changed_by,note) VALUES(p_order_id,v_order.status,'cancelled',p_actor_id,'Order cancelled before shipment');
 RETURN jsonb_build_object('id',p_order_id,'status','cancelled');
END;
$$;

import { NextResponse } from 'next/server';
import { sqlClient } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { productInputSchema, vendorRequestSchema, validate } from '@/lib/validation';

type VendorRow = { id: string; verification_status: string; is_active: boolean };

async function getActiveVendor(userId: string): Promise<VendorRow> {
  const rows = await sqlClient()`
    SELECT id,verification_status,is_active FROM vendors
    WHERE user_id=${userId} AND verification_status='verified' AND is_active=true
    LIMIT 1
  `;
  if (!rows.length) throw new Error('A verified, active vendor account is required.');
  return rows[0] as VendorRow;
}

async function requireApprovedCategory(category: string) {
  const rows = await sqlClient()`
    SELECT id FROM product_categories WHERE lower(name)=lower(${category}) AND status='approved' LIMIT 1
  `;
  if (!rows.length) throw new Error('This category is waiting for admin approval. Choose an approved category or suggest a new one.');
}

function cleanTrackingUrl(value: unknown) {
  const url = String(value || '').trim();
  if (!url) return null;
  if (url.length > 500) throw new Error('Tracking link is too long.');
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error('Enter a valid http or https tracking link.');
  }
  return url;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const params = new URL(req.url).searchParams;
    const orderLimit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 100);
    const orderOffset = Math.min(Math.max(Number(params.get('offset')) || 0, 0), 100000);
    const sql = sqlClient();
    const vendors = await sql`SELECT * FROM vendors WHERE user_id=${user.id} LIMIT 1`;
    if (!vendors.length) {
      return NextResponse.json({ vendor: null, products: [], orders: [], hasMoreOrders: false, categories: [], summary: null });
    }
    const vendor = vendors[0];
    const [products, categories, orders, productSummary, orderSummary] = await Promise.all([
      sql`SELECT * FROM products WHERE vendor_id=${vendor.id} ORDER BY created_at DESC`,
      sql`SELECT c.*,requesting_vendor.store_name AS vendor_name FROM product_categories c LEFT JOIN vendors requesting_vendor ON requesting_vendor.id=c.vendor_id WHERE c.vendor_id=${vendor.id} OR c.status='pending' ORDER BY c.created_at DESC`,
      sql`
        SELECT f.id AS fulfillment_id,f.status AS fulfillment_status,f.tracking_number,f.tracking_url,f.carrier_name,
          f.return_pickup_status,f.return_pickup_updated_at,o.id,o.order_number,o.status AS order_status,
          o.shipping_name,o.shipping_phone,o.shipping_address,o.created_at,
          COALESCE(json_agg(json_build_object(
            'product_name',i.product_name_snapshot,'quantity',i.quantity,'unit_price',i.unit_price,
            'commission_amount',i.commission_amount
          )) FILTER(WHERE i.id IS NOT NULL),'[]') AS items,
          COALESCE(sum(i.unit_price*i.quantity),0) AS item_total,
          COALESCE(sum(i.quantity),0)::int AS item_quantity,
          COALESCE((SELECT json_agg(json_build_object(
            'status',h.new_status,'note',h.note,'created_at',h.created_at
          ) ORDER BY h.created_at) FROM vendor_return_pickup_history h WHERE h.fulfillment_id=f.id),'[]') AS return_history
        FROM vendor_order_fulfillments f
        JOIN orders o ON o.id=f.order_id
        JOIN order_items i ON i.order_id=o.id AND i.vendor_id=f.vendor_id
        WHERE f.vendor_id=${vendor.id}
        GROUP BY f.id,o.id ORDER BY o.created_at DESC LIMIT ${orderLimit + 1} OFFSET ${orderOffset}
      `,
      sql`
        SELECT count(*)::int AS total_products,
          count(*) FILTER(WHERE status='approved')::int AS published_products,
          count(*) FILTER(WHERE status='pending')::int AS pending_products,
          count(*) FILTER(WHERE stock < 10)::int AS low_stock_products,
          count(*) FILTER(WHERE stock=0)::int AS out_of_stock_products
        FROM products WHERE vendor_id=${vendor.id}
      `,
      sql`
        SELECT count(DISTINCT f.id)::int AS total_orders,
          count(DISTINCT f.id) FILTER(WHERE f.status='pending')::int AS ordered_orders,
          count(DISTINCT f.id) FILTER(WHERE f.status IN ('packed','shipped','out_for_delivery'))::int AS in_progress_orders,
          count(DISTINCT f.id) FILTER(WHERE f.status='delivered')::int AS delivered_orders,
          count(DISTINCT f.id) FILTER(WHERE f.status='cancelled')::int AS cancelled_orders,
          COALESCE(sum(i.quantity) FILTER(WHERE f.status='pending'),0)::int AS ordered_units,
          COALESCE(sum(i.quantity) FILTER(WHERE f.status='delivered'),0)::int AS delivered_units,
          COALESCE(sum(i.quantity) FILTER(WHERE f.status='cancelled'),0)::int AS cancelled_units,
          COALESCE(sum(i.unit_price*i.quantity) FILTER(WHERE f.status='delivered'),0) AS delivered_gross,
          COALESCE(sum(i.commission_amount) FILTER(WHERE f.status='delivered'),0) AS delivered_commission,
          count(DISTINCT f.id) FILTER(WHERE f.return_pickup_status IN ('requested','scheduled','picked_up'))::int AS open_return_pickups
        FROM vendor_order_fulfillments f
        JOIN order_items i ON i.order_id=f.order_id AND i.vendor_id=f.vendor_id
        WHERE f.vendor_id=${vendor.id}
      `,
    ]);

    const hasMoreOrders = orders.length > orderLimit;
    return NextResponse.json({
      vendor,
      products,
      categories,
      orders: orders.slice(0, orderLimit),
      hasMoreOrders,
      summary: { ...productSummary[0], ...orderSummary[0] },
    });
  } catch (error) {
    return errorResponse(error, 401);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.role === 'admin') throw new Error('Admin account does not need vendor registration.');
    const { store_name, description, product } = validate(vendorRequestSchema, await req.json());
    const sql = sqlClient();
    let rows = await sql`SELECT * FROM vendors WHERE user_id=${user.id} LIMIT 1`;

    if (!rows.length) {
      const name = String(store_name || '').trim();
      if (!name) throw new Error('Enter your store name.');
      rows = await sql`INSERT INTO vendors(user_id,store_name,description) VALUES(${user.id},${name},${String(description || '').trim()}) RETURNING *`;
    } else if (store_name && rows[0].verification_status === 'rejected' && !product) {
      const name = String(store_name).trim();
      if (!name) throw new Error('Enter your store name.');
      rows = await sql`UPDATE vendors SET store_name=${name},description=${String(description || '').trim()},verification_status='pending',rejection_reason=NULL,updated_at=now() WHERE id=${rows[0].id} RETURNING *`;
    }

    const vendor = rows[0];
    if (product) {
      if (user.role !== 'vendor') throw new Error('Vendor access required.');
      if (vendor.verification_status !== 'verified' || !vendor.is_active) {
        throw new Error('Your vendor account must be verified and active before listing products.');
      }
      const validatedProduct = validate(productInputSchema, product);
      const price = Number(validatedProduct.price);
      const stock = Number(validatedProduct.stock);
      const category = String(validatedProduct.category).trim();
      await requireApprovedCategory(category);
      await sql`
        INSERT INTO products(vendor_id,name,category,description,price,stock,emoji,status,brand,sku)
        VALUES(${vendor.id},${validatedProduct.name},${category},${validatedProduct.description},${price},${stock},${validatedProduct.emoji},'pending',${validatedProduct.brand || null},${validatedProduct.sku || null})
      `;
    }
    return NextResponse.json({ vendor, message: product ? 'Product submitted for approval.' : 'Vendor application submitted for review.' });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== 'vendor') throw new Error('Vendor access required.');
    const body = await req.json();
    const vendor = await getActiveVendor(user.id);
    const sql = sqlClient();

    if (body.action === 'tracking') {
      const fulfillmentId = String(body.fulfillment_id || '');
      const carrier = String(body.carrier_name || '').trim().slice(0, 120) || null;
      const trackingNumber = String(body.tracking_number || '').trim().slice(0, 160) || null;
      const trackingUrl = cleanTrackingUrl(body.tracking_url);
      if (!fulfillmentId) throw new Error('Choose an order before saving tracking.');
      const rows = await sql`
        WITH prior AS (
          SELECT f.id,f.status FROM vendor_order_fulfillments f
          WHERE f.id=${fulfillmentId} AND f.vendor_id=${vendor.id} AND f.status NOT IN ('cancelled','delivered')
          FOR UPDATE
        ), updated AS (
          UPDATE vendor_order_fulfillments f
          SET carrier_name=${carrier},tracking_number=${trackingNumber},tracking_url=${trackingUrl},updated_at=now()
          FROM prior p WHERE f.id=p.id
          RETURNING f.id,p.status
        )
        INSERT INTO vendor_fulfillment_history(fulfillment_id,old_status,new_status,changed_by,note)
        SELECT id,status,status,${user.id},'Tracking details updated' FROM updated
        RETURNING fulfillment_id
      `;
      if (!rows.length) throw new Error('Order not found, cancelled, or no longer available for tracking updates.');
      return NextResponse.json({ ok: true, message: 'Tracking details saved.' });
    }

    if (body.action === 'return_pickup') {
      const nextStatus = String(body.status || '');
      const transition: Record<string, string> = { requested: 'scheduled', scheduled: 'picked_up', picked_up: 'received' };
      if (!body.fulfillment_id || transition[String(body.previous_status || '')] !== nextStatus) {
        throw new Error('Choose the next available return pickup step.');
      }
      const rows = await sql`
        WITH prior AS (
          SELECT f.id,f.return_pickup_status FROM vendor_order_fulfillments f
          JOIN orders o ON o.id=f.order_id
          WHERE f.id=${body.fulfillment_id} AND f.vendor_id=${vendor.id}
            AND f.return_pickup_status=${body.previous_status} AND o.status IN ('cancelled','delivered')
          FOR UPDATE OF f
        ), updated AS (
          UPDATE vendor_order_fulfillments f
          SET return_pickup_status=${nextStatus},return_pickup_updated_at=now(),updated_at=now()
          FROM prior p WHERE f.id=p.id
          RETURNING f.id,p.return_pickup_status
        )
        INSERT INTO vendor_return_pickup_history(fulfillment_id,old_status,new_status,changed_by,note)
        SELECT id,return_pickup_status,${nextStatus},${user.id},${String(body.note || '').trim().slice(0, 500) || 'Vendor return pickup update'}
        FROM updated RETURNING fulfillment_id
      `;
      if (!rows.length) throw new Error('Return pickup not found or its status has changed. Refresh and try again.');
      return NextResponse.json({ ok: true, message: 'Return pickup updated.' });
    }

    if (body.action === 'fulfillment') {
      const allowed = ['packed', 'shipped', 'out_for_delivery', 'delivered'];
      if (!body.fulfillment_id || !allowed.includes(body.status)) throw new Error('Invalid fulfillment update.');
      const trackingNumber = String(body.tracking_number || '').trim().slice(0, 160) || null;
      const trackingUrl = cleanTrackingUrl(body.tracking_url);
      const carrier = String(body.carrier_name || '').trim().slice(0, 120) || null;
      const rows = await sql`
        WITH prior AS (
          SELECT id,status FROM vendor_order_fulfillments
          WHERE id=${body.fulfillment_id} AND vendor_id=${vendor.id} FOR UPDATE
        ), updated AS (
          UPDATE vendor_order_fulfillments f
          SET status=${body.status},tracking_number=COALESCE(${trackingNumber},f.tracking_number),
            tracking_url=COALESCE(${trackingUrl},f.tracking_url),carrier_name=COALESCE(${carrier},f.carrier_name),updated_at=now()
          FROM prior p WHERE f.id=p.id AND (
            (p.status='pending' AND ${body.status}='packed') OR
            (p.status='packed' AND ${body.status}='shipped') OR
            (p.status='shipped' AND ${body.status}='out_for_delivery') OR
            (p.status='out_for_delivery' AND ${body.status}='delivered')
          ) RETURNING f.id,p.status AS old_status,f.status AS new_status
        )
        INSERT INTO vendor_fulfillment_history(fulfillment_id,old_status,new_status,changed_by,note)
        SELECT id,old_status,new_status,${user.id},'Vendor fulfillment update' FROM updated RETURNING fulfillment_id
      `;
      if (!rows.length) throw new Error('Fulfillment not found or already closed.');
      if (body.status === 'delivered') {
        await sql`
          WITH candidate AS (
            SELECT o.id,o.status AS old_status FROM orders o
            WHERE o.id=(SELECT order_id FROM vendor_order_fulfillments WHERE id=${body.fulfillment_id})
              AND o.status NOT IN ('cancelled','delivered')
              AND NOT EXISTS(SELECT 1 FROM vendor_order_fulfillments f WHERE f.order_id=o.id AND f.status<>'delivered')
            FOR UPDATE
          ), updated AS (
            UPDATE orders o SET status='delivered' FROM candidate c WHERE o.id=c.id
            RETURNING o.id,c.old_status,o.status AS new_status
          )
          INSERT INTO order_status_history(order_id,old_status,new_status,changed_by,note)
          SELECT id,old_status,new_status,${user.id},'All vendor shipments delivered' FROM updated
        `;
      }
      return NextResponse.json({ ok: true });
    }

    const { id, product: rawProduct } = body;
    const product = validate(productInputSchema, rawProduct);
    if (!id) throw new Error('Product details are required.');
    const category = String(product.category).trim();
    await requireApprovedCategory(category);
    const rows = await sql`
      UPDATE products SET name=${product.name},category=${category},description=${product.description},
        price=${product.price},stock=${product.stock},emoji=${product.emoji},brand=${product.brand || null},
        sku=${product.sku || null},status='pending',rejection_reason=NULL,updated_at=now()
      WHERE id=${id} AND vendor_id=${vendor.id} RETURNING id
    `;
    if (!rows.length) throw new Error('Product not found in your store.');
    return NextResponse.json({ ok: true, message: 'Product updated. Published changes are pending review.' });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== 'vendor') throw new Error('Vendor access required.');
    const id = new URL(req.url).searchParams.get('id');
    if (!id) throw new Error('Product ID is required.');
    const rows = await sqlClient()`
      DELETE FROM products p USING vendors v
      WHERE p.id=${id} AND p.vendor_id=v.id AND v.user_id=${user.id}
      RETURNING p.id
    `;
    if (!rows.length) throw new Error('Product not found in your store.');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

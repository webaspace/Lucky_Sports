import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { sqlClient } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { checkoutSchema, validate } from '@/lib/validation';

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await sqlClient()`
      SELECT o.*,
        COALESCE(json_agg(json_build_object(
          'product_name_snapshot', i.product_name_snapshot,
          'quantity', i.quantity,
          'unit_price', i.unit_price,
          'commission_amount', i.commission_amount
        )) FILTER (WHERE i.id IS NOT NULL), '[]') AS items,
        COALESCE((SELECT json_agg(json_build_object(
          'status', h.new_status, 'note', h.note, 'created_at', h.created_at
        ) ORDER BY h.created_at) FROM order_status_history h WHERE h.order_id=o.id), '[]') AS history
        ,COALESCE((SELECT json_agg(json_build_object(
          'fulfillment_id',f.id,'vendor_name',v.store_name,'status',f.status,
          'tracking_number',f.tracking_number,'tracking_url',f.tracking_url,'carrier_name',f.carrier_name,
          'return_pickup_status',f.return_pickup_status,'return_pickup_updated_at',f.return_pickup_updated_at,
          'return_history',(SELECT json_agg(json_build_object('status',rh.new_status,'note',rh.note,'created_at',rh.created_at) ORDER BY rh.created_at)
            FROM vendor_return_pickup_history rh WHERE rh.fulfillment_id=f.id)
        ) ORDER BY v.store_name) FROM vendor_order_fulfillments f
          JOIN vendors v ON v.id=f.vendor_id WHERE f.order_id=o.id), '[]') AS fulfillments
      FROM orders o
      LEFT JOIN order_items i ON i.order_id=o.id
      WHERE o.user_id=${user.id}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ orders: rows });
  } catch (error) {
    return errorResponse(error, 401);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { shipping_name, shipping_phone, shipping_address, idempotency_key } = validate(checkoutSchema, await req.json());
    const result = await sqlClient()`
      SELECT place_marketplace_order(
        ${user.id}, ${randomUUID()}, ${'SP-' + randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()},
        ${idempotency_key}, ${String(shipping_name || '')}, ${String(shipping_phone || '')}, ${String(shipping_address || '')}
      ) AS result
    `;
    const order = result[0]?.result;
    return NextResponse.json({ order, note: 'Demo checkout only. No payment was charged.' }, { status: order?.replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { order_id } = body;
    if (typeof order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(order_id)) throw new Error('Invalid order.');
    if (body.action === 'return_pickup') {
      const sql = sqlClient();
      const orders = await sql`SELECT id,status FROM orders WHERE id=${order_id} AND user_id=${user.id} LIMIT 1`;
      if (!orders.length) throw new Error('Order not found.');
      if (!['cancelled', 'delivered'].includes(orders[0].status)) {
        throw new Error('Return pickup can be requested after an order is cancelled or delivered.');
      }
      const rows = await sql`
        WITH eligible_order AS (
          SELECT id FROM orders WHERE id=${order_id} AND user_id=${user.id}
            AND status IN ('cancelled','delivered') FOR UPDATE
        ), updated AS (
          UPDATE vendor_order_fulfillments f
          SET return_pickup_status='requested',return_pickup_updated_at=now(),updated_at=now()
          FROM eligible_order o
          WHERE f.order_id=o.id AND f.return_pickup_status='none'
          RETURNING f.id
        )
        INSERT INTO vendor_return_pickup_history(fulfillment_id,new_status,changed_by,note)
        SELECT id,'requested',${user.id},'Customer requested a return pickup' FROM updated
        RETURNING fulfillment_id
      `;
      const current = await sql`
        SELECT return_pickup_status FROM vendor_order_fulfillments WHERE order_id=${order_id}
      `;
      if (!current.length) throw new Error('This order has no vendor shipments eligible for return pickup.');
      return NextResponse.json({
        ok: true,
        alreadyRequested: rows.length === 0,
        message: rows.length ? 'Return pickup requested.' : 'Return pickup is already in progress.',
        fulfillments: current,
      });
    }
    if (body.action && body.action !== 'cancel') throw new Error('Unknown order action.');
    const rows = await sqlClient()`SELECT cancel_marketplace_order(${order_id},${user.id},false) AS result`;
    return NextResponse.json({ order: rows[0]?.result });
  } catch (error) {
    return errorResponse(error);
  }
}

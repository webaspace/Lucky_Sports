import { NextResponse } from 'next/server';
import { sqlClient } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';

export async function GET() {
  try {
    const user = await requireUser();
    const products = await sqlClient()`SELECT p.*,v.store_name AS vendor_name FROM wishlists w JOIN products p ON p.id=w.product_id LEFT JOIN vendors v ON v.id=p.vendor_id WHERE w.user_id=${user.id} AND p.status='approved' ORDER BY w.created_at DESC`;
    return NextResponse.json({ product_ids: products.map(item => String(item.id)), products });
  } catch (error) {
    return errorResponse(error, 401);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { product_id, saved } = await req.json();
    if (typeof product_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(product_id) || typeof saved !== 'boolean') {
      throw new Error('Invalid wishlist update.');
    }
    if (saved) {
      const rows = await sqlClient()`INSERT INTO wishlists(user_id,product_id) SELECT ${user.id},p.id FROM products p WHERE p.id=${product_id} AND p.status='approved' ON CONFLICT DO NOTHING RETURNING product_id`;
      const product = await sqlClient()`SELECT id FROM products WHERE id=${product_id} AND status='approved' LIMIT 1`;
      if (!product.length) throw new Error('Product is unavailable.');
      return NextResponse.json({ saved: true, added: rows.length > 0 });
    }
    await sqlClient()`DELETE FROM wishlists WHERE user_id=${user.id} AND product_id=${product_id}`;
    return NextResponse.json({ saved: false });
  } catch (error) {
    return errorResponse(error);
  }
}

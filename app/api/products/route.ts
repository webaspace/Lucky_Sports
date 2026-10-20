import { NextResponse } from 'next/server';
import { sqlClient } from '@/lib/db';
import { errorResponse } from '@/lib/http';

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const category = params.get('category');
    const search = (params.get('q') || '').trim().slice(0, 120);
    const sort = params.get('sort') || 'newest';
    const limit = Math.min(Math.max(Number(params.get('limit')) || 24, 1), 60);
    const offset = Math.min(Math.max(Number(params.get('offset')) || 0, 0), 10000);
    const rows = await sqlClient()`
      SELECT p.*,v.store_name AS vendor_name
      FROM products p
      LEFT JOIN vendors v ON v.id=p.vendor_id
      WHERE p.status='approved'
        AND (p.vendor_id IS NULL OR (v.is_active=true AND v.verification_status='verified'))
        AND EXISTS(SELECT 1 FROM product_categories c WHERE lower(c.name)=lower(p.category) AND c.status='approved')
        AND (${!category || category === 'All sports'} OR p.category=${category})
        AND (${!search} OR p.name ILIKE ${'%' + search + '%'} OR p.description ILIKE ${'%' + search + '%'} OR COALESCE(p.brand,'') ILIKE ${'%' + search + '%'})
      ORDER BY CASE WHEN ${sort === 'price-low'} THEN p.price END ASC,
        CASE WHEN ${sort === 'price-high'} THEN p.price END DESC,
        p.created_at DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;
    return NextResponse.json({ products: rows.slice(0, limit), hasMore: rows.length > limit });
  } catch (error) {
    return errorResponse(error);
  }
}

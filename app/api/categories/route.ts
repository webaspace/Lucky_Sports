import { NextResponse } from 'next/server';
import { sqlClient } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { productCategorySchema, validate } from '@/lib/validation';

export async function GET(req: Request) {
  try {
    const sql = sqlClient();
    if (new URL(req.url).searchParams.get('mine') === '1') {
      const user = await requireUser();
      const rows = await sql`
        SELECT c.* FROM product_categories c
        JOIN vendors v ON v.id=c.vendor_id
        WHERE v.user_id=${user.id}
        ORDER BY c.created_at DESC
      `;
      return NextResponse.json({ categories: rows });
    }

    const rows = await sql`
      SELECT id,name FROM product_categories
      WHERE status='approved'
      ORDER BY lower(name),name
    `;
    return NextResponse.json({ categories: rows });
  } catch (error) {
    return errorResponse(error, 401);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.role === 'admin') throw new Error('Admin accounts do not submit vendor categories.');
    const { name } = validate(productCategorySchema, await req.json());
    const sql = sqlClient();
    const vendors = await sql`
      SELECT id FROM vendors
      WHERE user_id=${user.id} AND verification_status='verified' AND is_active=true
      LIMIT 1
    `;
    if (!vendors.length) throw new Error('A verified, active vendor account is required to suggest a category.');
    const vendorId = vendors[0].id;
    const existing = await sql`
      SELECT * FROM product_categories WHERE lower(name)=lower(${name}) LIMIT 1
    `;

    if (existing.length) {
      const category = existing[0];
      if (category.status === 'rejected' && category.vendor_id === vendorId) {
        const updated = await sql`
          UPDATE product_categories
          SET name=${name},status='pending',reviewed_by=NULL,rejection_reason=NULL,updated_at=now()
          WHERE id=${category.id} AND vendor_id=${vendorId}
          RETURNING *
        `;
        return NextResponse.json({ category: updated[0], message: 'Category resubmitted for admin approval.' });
      }
      if (category.status === 'approved') {
        return NextResponse.json({ category, message: 'This category is already approved and available.' });
      }
      if (category.vendor_id === vendorId) {
        return NextResponse.json({ category, message: 'This category is already waiting for admin review.' });
      }
      throw new Error('A category with this name already exists or is awaiting review.');
    }

    const rows = await sql`
      INSERT INTO product_categories(name,status,vendor_id,created_by)
      VALUES(${name},'pending',${vendorId},${user.id})
      RETURNING *
    `;
    return NextResponse.json({ category: rows[0], message: 'Category submitted for admin approval.' }, { status: 201 });
  } catch (error: any) {
    if (error?.code === '23505') return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 });
    return errorResponse(error);
  }
}

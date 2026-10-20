import { NextResponse } from 'next/server';
import { sqlClient } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';

export async function GET() {
  try {
    await requireAdmin();
    const sql = sqlClient();
    const [vendors, products, categories, settings] = await Promise.all([
      sql`
        SELECT
          v.*,
          u.email,
          u.full_name,
          u.phone,
          count(p.id)::int AS product_count
        FROM vendors v
        JOIN users u ON u.id = v.user_id
        LEFT JOIN products p ON p.vendor_id = v.id
        GROUP BY v.id, u.id
        ORDER BY v.created_at DESC
        LIMIT 200
      `,
      sql`
        SELECT p.*, v.store_name AS vendor_name
        FROM products p
        JOIN vendors v ON v.id = p.vendor_id
        ORDER BY p.created_at DESC
        LIMIT 500
      `,
      sql`SELECT c.*,v.store_name AS vendor_name FROM product_categories c LEFT JOIN vendors v ON v.id=c.vendor_id ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END, lower(c.name) LIMIT 300`,
      sql`SELECT value FROM marketplace_settings WHERE key = 'commerce' LIMIT 1`,
    ]);

    return NextResponse.json({
      vendors,
      products,
      categories,
      commissionRate: Number(settings[0]?.value?.commission_rate ?? 0.3),
    });
  } catch (error) {
    return errorResponse(error, 403);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const { action, id, value, reason } = await req.json();
    const sql = sqlClient();

    if (action === 'vendor') {
      if (!id || !['verified', 'rejected'].includes(value)) {
        throw new Error('Choose an available vendor action.');
      }

      const rejectionReason = value === 'rejected'
        ? String(reason || '').trim().slice(0, 1000) || 'Application needs more information.'
        : null;
      const rows = await sql`
        UPDATE vendors
        SET verification_status = ${value},
            rejection_reason = ${rejectionReason},
            updated_at = now()
        WHERE id = ${id}
        RETURNING user_id
      `;

      if (!rows.length) throw new Error('Vendor application not found.');
      if (value === 'verified') {
        await sql`
          UPDATE users
          SET role = 'vendor', updated_at = now()
          WHERE id = ${rows[0].user_id} AND role = 'user'
        `;
      }
      await sql`
        INSERT INTO audit_logs(actor_id, action, resource_type, resource_id, details)
        VALUES(
          ${admin.id},
          ${'vendor_' + value},
          'vendor',
          ${id},
          ${JSON.stringify({ reason: rejectionReason })}::jsonb
        )
      `;
    } else if (action === 'vendor-active') {
      if (!id || typeof value !== 'boolean') {
        throw new Error('Choose whether the vendor should be active.');
      }

      const rows = await sql`
        UPDATE vendors
        SET is_active = ${value}, updated_at = now()
        WHERE id = ${id} AND verification_status = 'verified'
        RETURNING id
      `;
      if (!rows.length) throw new Error('Verified vendor not found.');

      await sql`
        INSERT INTO audit_logs(actor_id, action, resource_type, resource_id, details)
        VALUES(
          ${admin.id},
          ${value ? 'vendor_activated' : 'vendor_suspended'},
          'vendor',
          ${id},
          '{}'::jsonb
        )
      `;
    } else if (action === 'product') {
      if (!id || !['approved', 'rejected'].includes(value)) {
        throw new Error('Choose an available product action.');
      }
      if (value === 'approved') {
        const category = await sql`
          SELECT p.category FROM products p
          JOIN product_categories c ON lower(c.name)=lower(p.category) AND c.status='approved'
          WHERE p.id=${id} LIMIT 1
        `;
        if (!category.length) throw new Error('Approve the product category before publishing this product.');
      }

      const rejectionReason = value === 'rejected'
        ? String(reason || '').trim().slice(0, 1000) || 'Listing did not meet marketplace requirements.'
        : null;
      const rows = await sql`
        UPDATE products
        SET status = ${value},
            rejection_reason = ${rejectionReason},
            updated_at = now()
        WHERE id = ${id} AND vendor_id IS NOT NULL
        RETURNING id
      `;
      if (!rows.length) throw new Error('Vendor product not found.');

      await sql`
        INSERT INTO audit_logs(actor_id, action, resource_type, resource_id, details)
        VALUES(
          ${admin.id},
          ${'product_' + value},
          'product',
          ${id},
          ${JSON.stringify({ reason: rejectionReason })}::jsonb
        )
      `;
    } else if (action === 'category') {
      if (!id || !['approved', 'rejected'].includes(value)) {
        throw new Error('Choose whether to approve or reject this category.');
      }
      const rejectionReason = value === 'rejected'
        ? String(reason || '').trim().slice(0, 1000) || 'Please suggest a more suitable category name.'
        : null;
      const rows = await sql`
        UPDATE product_categories
        SET status=${value},reviewed_by=${admin.id},rejection_reason=${rejectionReason},updated_at=now()
        WHERE id=${id}
        RETURNING name
      `;
      if (!rows.length) throw new Error('Category request not found.');
      await sql`
        INSERT INTO audit_logs(actor_id,action,resource_type,resource_id,details)
        VALUES(${admin.id},${'category_' + value},'product_category',${id},${JSON.stringify({ name: rows[0].name, reason: rejectionReason })}::jsonb)
      `;
    } else if (action === 'delete_product') {
      const rows = await sql`
        DELETE FROM products
        WHERE id = ${id} AND vendor_id IS NOT NULL
        RETURNING id
      `;
      if (!rows.length) throw new Error('Vendor product not found.');

      await sql`
        INSERT INTO audit_logs(actor_id, action, resource_type, resource_id)
        VALUES(${admin.id}, 'product_deleted', 'product', ${id})
      `;
    } else {
      throw new Error('Unknown admin action.');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 403);
  }
}

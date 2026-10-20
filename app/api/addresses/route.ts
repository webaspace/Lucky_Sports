import { NextResponse } from 'next/server';
import { sqlClient } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { addressSchema, validate } from '@/lib/validation';

export async function GET() {
  try {
    const user = await requireUser();
    const addresses = await sqlClient()`SELECT id,label,full_name,phone,address,is_default,created_at FROM customer_addresses WHERE user_id=${user.id} ORDER BY is_default DESC,created_at DESC`;
    return NextResponse.json({ addresses });
  } catch (error) {
    return errorResponse(error, 401);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { label, full_name: fullName, phone, address, is_default: makeDefault } = validate(addressSchema, await req.json());
    const sql = sqlClient();
    const result = await sql.transaction([
      sql`UPDATE customer_addresses SET is_default=false,updated_at=now() WHERE user_id=${user.id} AND ${makeDefault}`,
      sql`INSERT INTO customer_addresses(user_id,label,full_name,phone,address,is_default) VALUES(${user.id},${label},${fullName},${phone},${address},${makeDefault} OR NOT EXISTS(SELECT 1 FROM customer_addresses WHERE user_id=${user.id} AND is_default=true)) RETURNING id,label,full_name,phone,address,is_default,created_at`
    ]);
    return NextResponse.json({ address: result[1][0] }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) throw new Error('Address ID is required.');
    const rows = await sqlClient()`DELETE FROM customer_addresses WHERE id=${id} AND user_id=${user.id} RETURNING id`;
    if (!rows.length) throw new Error('Address not found.');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

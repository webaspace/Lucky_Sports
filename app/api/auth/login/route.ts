import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sqlClient } from '@/lib/db';
import { setSession, bootstrapAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { loginSchema, validate } from '@/lib/validation';
export async function POST(req:Request){try{const {email,password}=validate(loginSchema,await req.json());const sql=sqlClient();const rows=await sql`SELECT id,email,full_name,role,password_hash FROM users WHERE lower(email)=lower(${email}) AND is_active=true LIMIT 1`;if(!rows.length||!(await bcrypt.compare(password,rows[0].password_hash)))return errorResponse(new Error('Incorrect email or password.'),401);await bootstrapAdmin(rows[0].id,rows[0].email);const userRows=await sql`SELECT id,email,full_name,role FROM users WHERE id=${rows[0].id}`;const user=userRows[0];await setSession(user);return NextResponse.json({user});}catch(e){return errorResponse(e)}}

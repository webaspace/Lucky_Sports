import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sqlClient } from '@/lib/db';
import { setSession, bootstrapAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { signupSchema, validate } from '@/lib/validation';
export async function POST(req:Request){try{const {email,password,full_name,phone}=validate(signupSchema,await req.json());const sql=sqlClient();const hash=await bcrypt.hash(password,12);const rows=await sql`INSERT INTO users(email,password_hash,full_name,phone) VALUES(${email},${hash},${full_name},${phone}) RETURNING id,email,full_name,role`;const user=rows[0];await bootstrapAdmin(user.id,user.email);const fresh=await sql`SELECT id,email,full_name,role FROM users WHERE id=${user.id}`;await setSession(fresh[0]);return NextResponse.json({user:fresh[0]},{status:201});}catch(e:any){if(e?.code==='23505')return errorResponse(new Error('An account with this email already exists.'),409);return errorResponse(e)}}

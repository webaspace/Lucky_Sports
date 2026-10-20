import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { sqlClient } from './db';
const COOKIE='sportivo_session';
function key(){const s=process.env.AUTH_SECRET;if(!s||s.length<32)throw new Error('AUTH_SECRET must be at least 32 characters in .env.local');return new TextEncoder().encode(s)}
export async function setSession(user:any){const token=await new SignJWT({sub:user.id}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('7d').sign(key());cookies().set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*24*7})}
export async function getSession(){try{const token=cookies().get(COOKIE)?.value;if(!token)return null;const {payload}=await jwtVerify(token,key());if(!payload.sub)return null;const rows=await sqlClient()`SELECT id,email,role,full_name FROM users WHERE id=${String(payload.sub)} AND is_active=true LIMIT 1`;if(!rows.length)return null;return {id:String(rows[0].id),email:String(rows[0].email),role:String(rows[0].role),full_name:String(rows[0].full_name)}}catch{return null}}
export function clearSession(){cookies().set(COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0})}
export async function requireUser(){const user=await getSession();if(!user)throw new Error('Please sign in to continue.');return user}
export async function requireAdmin(){const user=await requireUser();if(user.role!=='admin')throw new Error('Admin access required.');return user}
export async function requireVendor(){const user=await requireUser();if(user.role!=='vendor')throw new Error('Vendor access required.');const rows=await sqlClient()`SELECT id FROM vendors WHERE user_id=${user.id} AND verification_status='verified' AND is_active=true LIMIT 1`;if(!rows.length)throw new Error('A verified, active vendor account is required.');return {user,vendorId:String(rows[0].id)}}
export async function bootstrapAdmin(userId:string,email:string){const configured=process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase().trim();if(configured&&configured===email.toLowerCase()) {const sql=sqlClient();await sql`UPDATE users SET role='admin' WHERE id=${userId} AND lower(email)=lower(${configured})`;}}

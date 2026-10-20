import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  // API handlers return a friendly setup error until .env.local is configured.
}
export function sqlClient() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured. Add DATABASE_URL from your Neon dashboard to .env.local and restart the app.');
  return neon(process.env.DATABASE_URL);
}

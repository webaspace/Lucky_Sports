import { z } from 'next/dist/compiled/zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254, 'Email address is too long.');
const password = z.string().min(8, 'Password must be at least 8 characters.').refine(value => new TextEncoder().encode(value).length <= 72, 'Password must be no more than 72 bytes.');

export const signupSchema = z.object({
  email,
  password,
  full_name: z.string().trim().min(1, 'Enter your name.').max(120, 'Name is too long.'),
  phone: z.string().trim().max(32, 'Phone number is too long.').optional().default('')
}).strict();

export const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password.') }).strict();

export const checkoutSchema = z.object({
  shipping_name: z.string().trim().min(1, 'Enter your delivery name.').max(120),
  shipping_phone: z.string().trim().min(1, 'Enter your phone number.').max(32),
  shipping_address: z.string().trim().min(1, 'Enter your delivery address.').max(500),
  idempotency_key: z.string().uuid('Refresh checkout and try again.')
}).strict();

export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a product name.').max(160),
  category: z.string().trim().min(1, 'Choose a category.').max(80),
  description: z.string().trim().max(4000).optional().default(''),
  brand: z.string().trim().max(120).optional().default(''),
  sku: z.string().trim().max(80).optional().default(''),
  emoji: z.string().max(16).optional().default('🏅'),
  price: z.coerce.number().finite().min(0).max(9999999999),
  stock: z.coerce.number().int().min(0).max(100000000)
}).strict();

export const productCategorySchema = z.object({
  name: z.string().trim().min(2, 'Category name must have at least 2 characters.').max(60, 'Category name is too long.')
}).strict();

export const vendorRequestSchema = z.object({
  store_name: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2000).optional().default(''),
  product: productInputSchema.optional()
}).strict();

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional().default('Home'),
  full_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(32),
  address: z.string().trim().min(1).max(500),
  is_default: z.boolean().optional().default(true)
}).strict();

export function validate(schema: any, input: unknown): any {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues[0]?.message || 'Check the submitted information.');
  return result.data;
}

import { createClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client (anon key). Used for optional test-history
 * persistence. This is a single-tenant app with no sign-in, so the anon key
 * is sufficient and RLS policies allow anon + authenticated.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

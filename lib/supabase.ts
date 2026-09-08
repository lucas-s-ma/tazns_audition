import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      'Configure .env.local with your Supabase project URL and server key, then apply the migration.',
    );
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

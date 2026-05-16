import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env.local and fill in your Supabase project values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * getUser
 * Returns the currently authenticated user or null.
 */
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Supabase table schemas expected:
 *
 * contacts:
 *   id          uuid primary key default gen_random_uuid()
 *   name        text not null
 *   phone       text not null unique
 *   created_at  timestamptz default now()
 *
 * voicemails:
 *   id             uuid primary key default gen_random_uuid()
 *   from_number    text
 *   recording_url  text
 *   transcription  text
 *   call_sid       text
 *   created_at     timestamptz default now()
 */

-- Email notification modes + daily digest + custom urgent keywords.
-- email_mode: 'off' | 'instant' | 'daily' | 'urgent'
--   off     — no emails
--   instant — email the moment each ticket completes (previous behavior)
--   daily   — one digest email per day at digest_time (user's timezone)
--   urgent  — urgent tickets emailed instantly, everything else in the digest

alter table public.profiles add column if not exists email_mode text not null default 'instant';
alter table public.profiles add column if not exists digest_time text not null default '08:00';
alter table public.profiles add column if not exists timezone text not null default 'America/Los_Angeles';
alter table public.profiles add column if not exists last_digest_at timestamptz;
alter table public.profiles add column if not exists urgent_keywords text[] not null default '{}';

-- Backfill from the old boolean: opted-out users become 'off'.
update public.profiles set email_mode = 'off' where notify_email = false and email_mode = 'instant';

-- Constrain to known values.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_email_mode_check') then
    alter table public.profiles add constraint profiles_email_mode_check
      check (email_mode in ('off', 'instant', 'daily', 'urgent'));
  end if;
end $$;

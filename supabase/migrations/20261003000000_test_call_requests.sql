-- Test-call requests for the dashboard "Call me now" button.
-- Rate limiting is enforced in the request-test-call edge function
-- (3 per user per rolling 24h); this table is the audit trail.

create table if not exists public.test_call_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  call_sid text,
  created_at timestamptz not null default now()
);

create index if not exists test_call_requests_user_created_idx
  on public.test_call_requests (user_id, created_at desc);

alter table public.test_call_requests enable row level security;
-- No public policies: only the service role (edge functions) reads/writes.

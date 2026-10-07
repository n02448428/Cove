-- Kernel v0.4: call classification + per-classification notification toggles.

-- Classification on tickets: LEAD, CUSTOMER, SOLICITATION. Null = not yet classified.
alter table public.review_tickets
  add column if not exists classification text
    check (classification in ('LEAD', 'CUSTOMER', 'SOLICITATION'));

create index if not exists review_tickets_classification_idx
  on public.review_tickets (user_id, classification);

-- Per-classification email toggles on phone_numbers (where notify_email lives).
-- Defaults per kernel v0.4.
alter table public.phone_numbers
  add column if not exists notify_email_lead boolean not null default true,
  add column if not exists notify_email_customer boolean not null default true,
  add column if not exists notify_email_solicitation boolean not null default false,
  add column if not exists notify_email_urgent boolean not null default true;

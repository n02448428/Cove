-- Emergency keyword path: flag tickets whose caller used emergency language.
alter table public.review_tickets
  add column if not exists urgent boolean not null default false;

create index if not exists review_tickets_urgent_idx
  on public.review_tickets (user_id, urgent) where urgent = true;

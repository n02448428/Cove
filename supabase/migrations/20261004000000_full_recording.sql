-- Full-call recording: one RecordingSid per ticket for the whole conversation.
alter table public.review_tickets
  add column if not exists full_recording_sid text;

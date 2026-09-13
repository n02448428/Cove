-- ============================================================
-- COVE CALL KERNEL v0.1 — AUTHORITATIVE SCHEMA
-- Migration: 20260913000000_call_kernel.sql
-- Source of truth: docs/Cove-Call-Kernel.md
-- Additive + obsolete-artifact cleanup. Idempotent.
-- ============================================================

-- 1. CALLER LISTS (RED reject / GREEN connect-live)
CREATE TABLE IF NOT EXISTS public.caller_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_number text NOT NULL CHECK (phone_number ~ '^\+[1-9]\d{1,14}$'),
  classification text NOT NULL CHECK (classification IN ('red','green')),
  contact_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.caller_lists ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS caller_lists_user_class_phone_key
  ON public.caller_lists (user_id, classification, phone_number);
CREATE INDEX IF NOT EXISTS idx_caller_lists_user_id ON public.caller_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_caller_lists_lookup ON public.caller_lists(user_id, phone_number);
DROP POLICY IF EXISTS "Users can view own caller lists" ON public.caller_lists;
CREATE POLICY "Users can view own caller lists" ON public.caller_lists FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own caller lists" ON public.caller_lists;
CREATE POLICY "Users can insert own caller lists" ON public.caller_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own caller lists" ON public.caller_lists;
CREATE POLICY "Users can update own caller lists" ON public.caller_lists FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own caller lists" ON public.caller_lists;
CREATE POLICY "Users can delete own caller lists" ON public.caller_lists FOR DELETE USING (auth.uid() = user_id);

-- 2. ACCESS CODES (keypad bypass; min 3 digits; many per user)
CREATE TABLE IF NOT EXISTS public.access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[0-9]{3,}$'),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_access_codes_user_id ON public.access_codes(user_id);
DROP POLICY IF EXISTS "Users can view own access codes" ON public.access_codes;
CREATE POLICY "Users can view own access codes" ON public.access_codes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own access codes" ON public.access_codes;
CREATE POLICY "Users can insert own access codes" ON public.access_codes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own access codes" ON public.access_codes;
CREATE POLICY "Users can update own access codes" ON public.access_codes FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own access codes" ON public.access_codes;
CREATE POLICY "Users can delete own access codes" ON public.access_codes FOR DELETE USING (auth.uid() = user_id);

-- 3. SCREENING QUESTIONS (1-5 ordered, spoken exactly as saved)
CREATE TABLE IF NOT EXISTS public.screening_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ord integer NOT NULL CHECK (ord BETWEEN 1 AND 5),
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.screening_questions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS screening_questions_user_ord_key ON public.screening_questions (user_id, ord);
CREATE INDEX IF NOT EXISTS idx_screening_questions_user_id ON public.screening_questions(user_id);
DROP POLICY IF EXISTS "Users can view own questions" ON public.screening_questions;
CREATE POLICY "Users can view own questions" ON public.screening_questions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own questions" ON public.screening_questions;
CREATE POLICY "Users can insert own questions" ON public.screening_questions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own questions" ON public.screening_questions;
CREATE POLICY "Users can update own questions" ON public.screening_questions FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own questions" ON public.screening_questions;
CREATE POLICY "Users can delete own questions" ON public.screening_questions FOR DELETE USING (auth.uid() = user_id);

-- 4. REVIEW TICKETS (Yellow call product object)
CREATE TABLE IF NOT EXISTS public.review_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_sid text NOT NULL,
  caller_number text,
  caller_name text,
  status text NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting','transcribing','new','reviewed','actioned','failed')),
  ended_reason text CHECK (ended_reason IS NULL OR ended_reason IN ('completed','no_answer','caller_hung_up','failed')),
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_review_tickets_user_id ON public.review_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_review_tickets_status ON public.review_tickets(status);
CREATE INDEX IF NOT EXISTS idx_review_tickets_call_sid ON public.review_tickets(call_sid);
DROP POLICY IF EXISTS "Users can view own tickets" ON public.review_tickets;
CREATE POLICY "Users can view own tickets" ON public.review_tickets FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own tickets" ON public.review_tickets;
CREATE POLICY "Users can insert own tickets" ON public.review_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own tickets" ON public.review_tickets;
CREATE POLICY "Users can update own tickets" ON public.review_tickets FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own tickets" ON public.review_tickets;
CREATE POLICY "Users can delete own tickets" ON public.review_tickets FOR DELETE USING (auth.uid() = user_id);

-- 5. REVIEW TICKET ANSWERS (one row per question/attempt; async transcription fills transcript later)
CREATE TABLE IF NOT EXISTS public.review_ticket_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.review_tickets(id) ON DELETE CASCADE,
  question_ord integer NOT NULL,
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 2),
  question_text text NOT NULL,
  recording_sid text,
  recording_url text,
  recording_duration integer,
  transcript text,
  transcription_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_ticket_answers ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS review_ticket_answers_ticket_ord_attempt_key
  ON public.review_ticket_answers (ticket_id, question_ord, attempt);
CREATE INDEX IF NOT EXISTS idx_review_ticket_answers_ticket_id ON public.review_ticket_answers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_review_ticket_answers_recording_sid ON public.review_ticket_answers(recording_sid);
DROP POLICY IF EXISTS "Users can view own answers" ON public.review_ticket_answers;
CREATE POLICY "Users can view own answers" ON public.review_ticket_answers FOR SELECT USING (EXISTS (SELECT 1 FROM public.review_tickets t WHERE t.id = review_ticket_answers.ticket_id AND t.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert own answers" ON public.review_ticket_answers;
CREATE POLICY "Users can insert own answers" ON public.review_ticket_answers FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.review_tickets t WHERE t.id = review_ticket_answers.ticket_id AND t.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own answers" ON public.review_ticket_answers;
CREATE POLICY "Users can update own answers" ON public.review_ticket_answers FOR UPDATE USING (EXISTS (SELECT 1 FROM public.review_tickets t WHERE t.id = review_ticket_answers.ticket_id AND t.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete own answers" ON public.review_ticket_answers;
CREATE POLICY "Users can delete own answers" ON public.review_ticket_answers FOR DELETE USING (EXISTS (SELECT 1 FROM public.review_tickets t WHERE t.id = review_ticket_answers.ticket_id AND t.user_id = auth.uid()));

-- 6. MIGRATE trusted_contacts -> caller_lists (GREEN), then drop trusted_contacts
INSERT INTO public.caller_lists (user_id, phone_number, classification, contact_name)
SELECT user_id, phone_number, 'green', contact_name
FROM public.trusted_contacts
ON CONFLICT (user_id, classification, phone_number) DO NOTHING;
DROP TABLE IF EXISTS public.trusted_contacts CASCADE;

-- 7. DROP screening_rules (keyword screening obsolete per kernel)
DROP TABLE IF EXISTS public.screening_rules CASCADE;

-- 8. call_logs: link tickets, replace checks with kernel enum, THEN remap legacy values.
--    Order matters: drop old constraints first so remapped values pass, then add new ones.
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.review_tickets(id) ON DELETE SET NULL;

ALTER TABLE public.call_logs DROP CONSTRAINT IF EXISTS call_logs_outcome_check;
ALTER TABLE public.call_logs DROP CONSTRAINT IF EXISTS call_logs_status_check;
ALTER TABLE public.call_logs DROP CONSTRAINT IF EXISTS call_logs_call_state_check;

UPDATE public.call_logs SET outcome = 'screened' WHERE outcome = 'voicemail';
UPDATE public.call_logs SET outcome = 'rejected' WHERE outcome = 'blocked';
UPDATE public.call_logs SET outcome = 'connected_live' WHERE outcome = 'forwarded';
UPDATE public.call_logs SET status = 'screened' WHERE status = 'voicemail';
UPDATE public.call_logs SET status = 'rejected' WHERE status = 'blocked';
UPDATE public.call_logs SET status = 'connected_live' WHERE status = 'forwarded';
UPDATE public.call_logs SET call_state = 'screened' WHERE call_state = 'voicemail';
UPDATE public.call_logs SET call_state = 'rejected' WHERE call_state = 'blocked';
UPDATE public.call_logs SET call_state = 'connected_live' WHERE call_state IN ('forwarded','forwarding');
UPDATE public.call_logs SET call_state = 'screened' WHERE call_state = 'screening';

ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_outcome_check
  CHECK (outcome IN ('received','screening','rejected','connected_live','screened','code_connected','no_answer','failed'));
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_status_check
  CHECK (status IN ('received','screening','rejected','connected_live','screened','code_connected','no_answer','failed'));
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_call_state_check
  CHECK (call_state IN ('received','screening','rejected','connected_live','screened','code_connected','no_answer','failed'));
CREATE INDEX IF NOT EXISTS idx_call_logs_ticket_id ON public.call_logs(ticket_id);

-- 9. updated_at triggers for new mutable tables (set_updated_at() already exists)
DROP TRIGGER IF EXISTS set_review_tickets_updated_at ON public.review_tickets;
CREATE TRIGGER set_review_tickets_updated_at
  BEFORE UPDATE ON public.review_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_screening_questions_updated_at ON public.screening_questions;
CREATE TRIGGER set_screening_questions_updated_at
  BEFORE UPDATE ON public.screening_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

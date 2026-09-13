-- ============================================================
-- COVE — Kernel table GRANTs + default screening question
-- Fixes: missing GRANTs on kernel tables (review_tickets, etc.)
-- and adds a trigger to seed a default screening question for new users.
-- ============================================================

-- Grant privileges on kernel tables to authenticated role
GRANT ALL ON public.review_tickets TO authenticated;
GRANT ALL ON public.review_ticket_answers TO authenticated;
GRANT ALL ON public.screening_questions TO authenticated;
GRANT ALL ON public.access_codes TO authenticated;
GRANT ALL ON public.caller_lists TO authenticated;

-- Read-only for anon role
GRANT SELECT ON public.review_tickets TO anon;
GRANT SELECT ON public.review_ticket_answers TO anon;
GRANT SELECT ON public.screening_questions TO anon;
GRANT SELECT ON public.access_codes TO anon;
GRANT SELECT ON public.caller_lists TO anon;

-- Auto-insert a default screening question for new users
CREATE OR REPLACE FUNCTION public.seed_default_screening_question()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.screening_questions (user_id, ord, question)
  VALUES (NEW.id, 1, 'Who is calling, please?')
  ON CONFLICT (user_id, ord) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_user_seed_question ON public.profiles;
CREATE TRIGGER on_new_user_seed_question
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_screening_question();

-- Seed default question for existing users who have none
INSERT INTO public.screening_questions (user_id, ord, question)
SELECT p.id, 1, 'Who is calling, please?'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.screening_questions sq WHERE sq.user_id = p.id
)
ON CONFLICT (user_id, ord) DO NOTHING;

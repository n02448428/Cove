-- Display name spoken in the Yellow greeting ("Cove, <name>'s assistant").
-- Falls back to the email prefix when empty; existing RLS policies on
-- profiles already cover this column (users can view/update their own row).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN public.profiles.display_name IS
  'Spoken in the Yellow screening greeting; falls back to email prefix when empty';

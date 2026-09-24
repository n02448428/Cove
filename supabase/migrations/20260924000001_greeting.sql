-- Customizable greeting for Yellow screening.
-- The greeting is the first thing a caller hears; {name} is substituted
-- with the user's display_name at call time.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS greeting TEXT;

-- Backfill existing users with the default greeting template.
-- (Greeting is intro-only; the first saved question does the asking.)
UPDATE profiles
SET greeting = 'Hello, this is Cove, {name}''s assistant.'
WHERE greeting IS NULL;

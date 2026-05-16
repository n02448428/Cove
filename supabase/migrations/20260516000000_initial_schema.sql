-- ============================================================
-- COVE MVP - Initial Schema Migration
-- 20260516000000_initial_schema.sql
-- ============================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. PHONE NUMBERS
CREATE TABLE IF NOT EXISTS public.phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  real_number text NOT NULL CHECK (real_number ~ '^\+[1-9]\d{1,14}$'),
  twilio_number text UNIQUE CHECK (twilio_number ~ '^\+[1-9]\d{1,14}$'),
  notify_sms bool NOT NULL DEFAULT false,
  notify_email bool NOT NULL DEFAULT false,
  provisioning_status text NOT NULL DEFAULT 'pending' CHECK (provisioning_status IN ('pending','active','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own phone numbers" ON public.phone_numbers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own phone numbers" ON public.phone_numbers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own phone numbers" ON public.phone_numbers FOR UPDATE USING (auth.uid() = user_id);

-- 3. SCREENING RULES
CREATE TABLE IF NOT EXISTS public.screening_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  urgent_keywords text[] NOT NULL DEFAULT ARRAY['emergency','accident','hospital','urgent','911','police','fire','ambulance','school'],
  block_keywords text[] NOT NULL DEFAULT ARRAY['survey','warranty','offer','loan','credit','investment','sales','marketing','promotion','solicitor'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.screening_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own screening rules" ON public.screening_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own screening rules" ON public.screening_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own screening rules" ON public.screening_rules FOR UPDATE USING (auth.uid() = user_id);

-- 4. TRUSTED CONTACTS
CREATE TABLE IF NOT EXISTS public.trusted_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  phone_number text NOT NULL CHECK (phone_number ~ '^\+[1-9]\d{1,14}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own trusted contacts" ON public.trusted_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trusted contacts" ON public.trusted_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trusted contacts" ON public.trusted_contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trusted contacts" ON public.trusted_contacts FOR DELETE USING (auth.uid() = user_id);

-- 5. CALL LOGS
CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_sid text UNIQUE NOT NULL,
  provider_ids jsonb,
  caller_number text,
  caller_name text,
  outcome text CHECK (outcome IN ('received','screened','forwarded','voicemail','blocked','failed')),
  status text CHECK (status IN ('received','screened','forwarded','voicemail','blocked','failed')),
  failure_reason text,
  summary text,
  transcript text,
  voicemail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own call logs" ON public.call_logs FOR SELECT USING (auth.uid() = user_id);

-- 6. CALL AUDIT
CREATE TABLE IF NOT EXISTS public.call_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_sid text NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  provider text,
  latency_ms integer,
  retry_count integer DEFAULT 0,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.call_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own call audit" ON public.call_audit FOR SELECT USING (auth.uid() = user_id);

-- 7. AUTO-CREATE PROFILE TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. UPDATED_AT TRIGGERS
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_screening_rules_updated_at
  BEFORE UPDATE ON public.screening_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_call_logs_updated_at
  BEFORE UPDATE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. INDEXES
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_id ON public.phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_twilio_number ON public.phone_numbers(twilio_number);
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_user_id ON public.trusted_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON public.call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON public.call_logs(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON public.call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_audit_call_sid ON public.call_audit(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_audit_user_id ON public.call_audit(user_id);

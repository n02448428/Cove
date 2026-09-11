-- Billing + grace fields for Cove ($49 card-gated trial)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status text
    CHECK (subscription_status IS NULL OR subscription_status IN (
      'none','trialing','active','past_due','canceled','grace'
    )) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON public.profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz;

COMMENT ON COLUMN public.profiles.subscription_status IS 'Stripe-driven; grace = canceled but DID held 30d';
COMMENT ON COLUMN public.phone_numbers.reserved_until IS 'Grace hold end; after this DID may be released';

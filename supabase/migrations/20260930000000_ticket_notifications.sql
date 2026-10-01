-- ============================================================
-- COVE - Ticket notifications (email + web push)
-- 20260930000000_ticket_notifications.sql
-- ============================================================

-- Email preference on the profile. On by default: Cove emails you
-- after every screened call unless you turn it off in Settings.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;

-- Exactly-once claim for built-in notifications, mirroring the
-- review_tickets.webhook_sent_at pattern.
ALTER TABLE public.review_tickets
  ADD COLUMN IF NOT EXISTS notifications_sent_at timestamptz;

-- Web Push subscriptions, one row per device/browser.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can add own push subscriptions"
  ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can remove own push subscriptions"
  ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

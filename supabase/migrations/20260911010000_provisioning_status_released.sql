-- Allow provisioning_status = 'released' after grace DID release
ALTER TABLE public.phone_numbers
  DROP CONSTRAINT IF EXISTS phone_numbers_provisioning_status_check;

ALTER TABLE public.phone_numbers
  ADD CONSTRAINT phone_numbers_provisioning_status_check
  CHECK (provisioning_status IN ('pending', 'active', 'failed', 'released'));

COMMENT ON COLUMN public.phone_numbers.released_at IS 'When Twilio DID was released after grace; twilio_number cleared';

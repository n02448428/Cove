import { supabase } from './supabase.js';

/**
 * isTrustedContact
 * Returns true if the given phone number is in the trusted contacts list.
 * Normalizes E.164 format before comparison.
 * @param {string} phone - e.g. "+16195551234"
 * @returns {Promise<boolean>}
 */
export async function isTrustedContact(phone) {
  if (!phone) return false;

  const normalized = phone.trim();

  const { data, error } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', normalized)
    .maybeSingle();

  if (error) {
    console.error('Error checking trusted contact:', error.message);
    return false;
  }

  return data !== null;
}

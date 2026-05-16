import { supabase } from '../lib/supabase';

// — Auth ————————————————————————————————————————
export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password });

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signOut = () => supabase.auth.signOut();

export const getSession = () => supabase.auth.getSession();

// — User Profile ————————————————————————————————
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
};

export const upsertProfile = async (profile) => {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// — Phone Numbers ———————————————————————————————
export const getPhoneNumber = async (userId) => {
  const { data, error } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
};

export const upsertPhoneNumber = async (row) => {
  const { data, error } = await supabase
    .from('phone_numbers')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// — Screening Rules —————————————————————————————
export const getScreeningRules = async (userId) => {
  const { data, error } = await supabase
    .from('screening_rules')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
};

export const upsertScreeningRules = async (row) => {
  const { data, error } = await supabase
    .from('screening_rules')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// — Trusted Contacts ————————————————————————————
export const getTrustedContacts = async (userId) => {
  const { data, error } = await supabase
    .from('trusted_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const replaceTrustedContacts = async (userId, contacts) => {
  // Delete all existing contacts for user, then insert new set
  const { error: delError } = await supabase
    .from('trusted_contacts')
    .delete()
    .eq('user_id', userId);
  if (delError) throw delError;
  if (!contacts.length) return [];
  const { data, error } = await supabase
    .from('trusted_contacts')
    .insert(contacts.map(c => ({ ...c, user_id: userId })))
    .select();
  if (error) throw error;
  return data;
};

// — Call Logs ———————————————————————————————————
export const getCallLogs = async (userId, { limit = 50, offset = 0, outcome } = {}) => {
  let query = supabase
    .from('call_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (outcome) query = query.eq('outcome', outcome);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

export const getCallLog = async (id) => {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

// — Admin ———————————————————————————————————————
export const getAllCallLogs = async ({ limit = 100, offset = 0 } = {}) => {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*, phone_numbers(twilio_number, real_number)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
};

export const getAllProfiles = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, phone_numbers(twilio_number, provisioning_status)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
};

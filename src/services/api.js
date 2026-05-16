import { supabase } from '../lib/supabase';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password });

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signOut = () => supabase.auth.signOut();

export const getSession = () => supabase.auth.getSession();

// ── User Profile ──────────────────────────────────────────────────────────────
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
};

export const upsertProfile = async (profile) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(profile)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ── Call Logs ─────────────────────────────────────────────────────────────────
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
  return data;
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

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getAllCallLogs = async ({ limit = 100, offset = 0 } = {}) => {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*, user_profiles(real_phone)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
};

export const getAllProfiles = async () => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

import { supabase } from '../lib/supabase';
import { toE164, isValidE164, isValidCode, E164_ERROR, CODE_ERROR } from '../lib/phone';

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

// — Caller Lists (RED / GREEN) ——————————————————————
export const getCallerLists = async (userId) => {
  const { data, error } = await supabase
    .from('caller_lists')
    .select('*')
    .eq('user_id', userId)
    .order('classification', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const addCallerList = async (userId, { phone_number, classification, contact_name }) => {
  const normalized = toE164(phone_number);
  if (!isValidE164(normalized)) throw new Error(E164_ERROR);
  if (classification !== 'red' && classification !== 'green') {
    throw new Error('classification must be red or green');
  }
  const { data, error } = await supabase
    .from('caller_lists')
    .insert({
      user_id: userId,
      phone_number: normalized,
      classification,
      contact_name: contact_name?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteCallerList = async (id) => {
  const { error } = await supabase.from('caller_lists').delete().eq('id', id);
  if (error) throw error;
};

// — Access Codes ———————————————————————————————
export const getAccessCodes = async (userId, { includeRevoked = true } = {}) => {
  let query = supabase
    .from('access_codes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (!includeRevoked) query = query.is('revoked_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

export const addAccessCode = async (userId, { code, label, expires_at }) => {
  if (!isValidCode(code)) throw new Error(CODE_ERROR);
  const { data, error } = await supabase
    .from('access_codes')
    .insert({
      user_id: userId,
      code: String(code).trim(),
      label: label?.trim() || null,
      expires_at: expires_at || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const revokeAccessCode = async (id) => {
  const { data, error } = await supabase
    .from('access_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteAccessCode = async (id) => {
  const { error } = await supabase.from('access_codes').delete().eq('id', id);
  if (error) throw error;
};

// — Screening Questions (1–5) ——————————————————————
export const getScreeningQuestions = async (userId) => {
  const { data, error } = await supabase
    .from('screening_questions')
    .select('*')
    .eq('user_id', userId)
    .order('ord', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const upsertScreeningQuestion = async (userId, { ord, question }) => {
  if (!Number.isInteger(ord) || ord < 1 || ord > 5) {
    throw new Error('ord must be an integer 1–5');
  }
  const { data, error } = await supabase
    .from('screening_questions')
    .upsert(
      { user_id: userId, ord, question },
      { onConflict: 'user_id,ord' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteScreeningQuestion = async (id) => {
  const { error } = await supabase.from('screening_questions').delete().eq('id', id);
  if (error) throw error;
};

// Replace ALL of a user's questions with a contiguous ord 1..N set. Use this for
// any add/edit/delete so ords never collide or drift (the unique constraint is
// on user_id+ord, so single-upsert add-after-delete would overwrite an existing
// ord). Pass the full ordered list of question texts. Upserts the contiguous set
// first, deletes any surplus ords, then refetches — avoids a zero-question
// window and always returns fresh rows.
export const replaceScreeningQuestions = async (userId, texts) => {
  const rows = (texts ?? [])
    .map((t) => (t ?? '').trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((question, i) => ({ user_id: userId, ord: i + 1, question }));

  if (rows.length) {
    const { error } = await supabase
      .from('screening_questions')
      .upsert(rows, { onConflict: 'user_id,ord' });
    if (error) throw error;
  }

  // Delete any questions beyond the new contiguous set (or all if empty).
  let del = supabase.from('screening_questions').delete().eq('user_id', userId);
  del = rows.length ? del.gt('ord', rows.length) : del;
  const { error: delErr } = await del;
  if (delErr) throw delErr;

  return getScreeningQuestions(userId);
};

// — Review Tickets —————————————————————————————
export const getReviewTickets = async (userId, { status } = {}) => {
  let query = supabase
    .from('review_tickets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

export const getReviewTicketAnswers = async (ticketId) => {
  const { data, error } = await supabase
    .from('review_ticket_answers')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('question_ord', { ascending: true })
    .order('attempt', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const updateReviewTicketStatus = async (id, status) => {
  const { data, error } = await supabase
    .from('review_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
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

// — Stripe Checkout ——————————————————————————————
export const createCheckoutSession = async () => {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('Not authenticated');
  }

  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) throw new Error('VITE_SUPABASE_URL is not set');

  const res = await fetch(`${base.replace(/\/$/, '')}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Checkout failed (${res.status})`);
  }
  if (!payload.url) throw new Error('Checkout session missing url');
  return payload;
};

// — Stripe Customer Portal ——————————————————————
export const createPortalSession = async () => {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('Not authenticated');
  }

  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) throw new Error('VITE_SUPABASE_URL is not set');

  const res = await fetch(`${base.replace(/\/$/, '')}/functions/v1/create-portal-session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Portal failed (${res.status})`);
  }
  if (!payload.url) throw new Error('Portal session missing url');
  return payload;
};

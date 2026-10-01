import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { toE164, isValidE164, E164_ERROR } from '../lib/phone.js';
import AppHeader from '../components/AppHeader.jsx';
import CoveMark from '../components/CoveMark.jsx';
import { createCheckoutSession } from '../services/api.js';

const MAX_QUESTIONS = 5;

export default function Onboarding() {
  const navigate = useNavigate();
  const [realPhone, setRealPhone] = useState('');
  const [emailNotifs, setEmailNotifs] = useState(true);
  // NOTE: SMS notifications are not offered in this beta. The phone_numbers.notify_sms
  // column stays as a placeholder for a future SMS channel — nothing user-facing reads it.

  // optional initial lists
  const [redList, setRedList] = useState(''); // one per line: Name +1XXXXXXXXXX
  const [greenList, setGreenList] = useState('');
  const [questions, setQuestions] = useState(''); // one per line

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadExisting() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: phone } = await supabase
        .from('phone_numbers')
        .select('real_number')
        .eq('user_id', user.id)
        .maybeSingle();

      if (phone) {
        if (phone.real_number) setRealPhone(phone.real_number);
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('notify_email')
        .eq('id', user.id)
        .maybeSingle();

      if (profile && typeof profile.notify_email === 'boolean') {
        setEmailNotifs(profile.notify_email);
      }
    }
    loadExisting();
  }, []);

  function parseList(text) {
    return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split(/\s+/);
      const phone = toE164(parts[parts.length - 1]);
      const name = parts.slice(0, -1).join(' ').trim() || null;
      return { name, phone };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Ensure public.profiles exists before any FK-dependent upserts.
      // The email preference lives here now (profiles.notify_email) — the same
      // switch the Settings page and the notification sender read.
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        notify_email: emailNotifs,
      }, { onConflict: 'id' });
      if (profileErr) throw profileErr;

      const realNumber = toE164(realPhone);
      if (!isValidE164(realNumber)) {
        throw new Error(E164_ERROR);
      }

      // parse + validate lists
      const reds = parseList(redList);
      const greens = parseList(greenList);
      for (const r of [...reds, ...greens]) {
        if (!isValidE164(r.phone)) {
          throw new Error(`Invalid phone number: ${r.phone}`);
        }
      }

      // parse questions
      const parsedQuestions = questions.split('\n').map(l => l.trim()).filter(Boolean).slice(0, MAX_QUESTIONS);

      // phone_numbers owns real_number and provisioning_status.
      // notify_sms stays NULL/unset — no SMS channel in this beta.
      // Keep existing twilio_number if already provisioned (do not wipe live number)
      const { data: existingPhone } = await supabase
        .from('phone_numbers')
        .select('id, twilio_number, provisioning_status')
        .eq('user_id', user.id)
        .maybeSingle();

      const alreadyActive =
        existingPhone?.provisioning_status === 'active' && existingPhone?.twilio_number;

      const phonePayload = {
        user_id: user.id,
        real_number: realNumber,
        provisioning_status: alreadyActive ? 'active' : 'pending',
      };

      const { error: phoneErr } = await supabase
        .from('phone_numbers')
        .upsert(phonePayload, { onConflict: 'user_id' });
      if (phoneErr) throw phoneErr;

      // insert caller lists (ignore duplicates that violate unique constraint)
      const listRows = [
        ...reds.map(r => ({ user_id: user.id, phone_number: r.phone, classification: 'red', contact_name: r.name })),
        ...greens.map(r => ({ user_id: user.id, phone_number: r.phone, classification: 'green', contact_name: r.name })),
      ];
      if (listRows.length) {
        const { error: listErr } = await supabase.from('caller_lists').upsert(listRows, { onConflict: 'user_id,classification,phone_number', ignoreDuplicates: true });
        if (listErr) throw new Error(`Could not save RED/GREEN lists: ${listErr.message}`);
      }

      // insert questions (ord 1..N)
      if (parsedQuestions.length) {
        const qRows = parsedQuestions.map((q, i) => ({ user_id: user.id, ord: i + 1, question: q }));
        const { error: qErr } = await supabase.from('screening_questions').upsert(qRows, { onConflict: 'user_id,ord' });
        if (qErr) throw new Error(`Could not save questions: ${qErr.message}`);
      }

      // Card-gated trial: send to Stripe Checkout unless already provisioned
      if (!alreadyActive) {
        try {
          const { url } = await createCheckoutSession();
          if (url) {
            window.location.href = url;
            return;
          }
        } catch (checkoutErr) {
          console.error('Checkout start failed:', checkoutErr);
          // Fall through to forwarding with retry CTA
          navigate('/forwarding?checkout=needed');
          return;
        }
      }

      navigate('/forwarding');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-narrow">
      <AppHeader homeTo="/" />
      <div className="card">
        <h2 className="page-title" style={{ fontSize: '1.75rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <CoveMark size={30} />
          Set up your cove
        </h2>
        <p className="page-lede" style={{ marginBottom: 24 }}>Takes about 2 minutes. Your Cove number provisions after payment method is saved.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Your Real Phone Number</label>
            <input
              type="tel"
              value={realPhone}
              onChange={e => setRealPhone(e.target.value)}
              placeholder="9175387426 or +19175387426"
              required
            />
            <p className="hint">
              Trusted callers ring this number. 10-digit US numbers like 9175387426 are fine (we add +1).
            </p>
          </div>

          <div className="field">
            <label>RED list (optional)</label>
            <textarea
              value={redList}
              onChange={e => setRedList(e.target.value)}
              placeholder={"Spam Co +18005551234\n+18005559876"}
              rows={3}
            />
            <p className="hint">One per line: Name then number. These callers are rejected immediately.</p>
          </div>

          <div className="field">
            <label>GREEN list (optional)</label>
            <textarea
              value={greenList}
              onChange={e => setGreenList(e.target.value)}
              placeholder={"Mom +16195550001\nDad +16195550002"}
              rows={3}
            />
            <p className="hint">Family, doctors, schools — anyone who should always reach you directly. One per line: Name then number.</p>
          </div>

          <div className="field">
            <label>Screening questions (optional)</label>
            <textarea
              value={questions}
              onChange={e => setQuestions(e.target.value)}
              placeholder={"Who is calling, please?\nWhat is this regarding?"}
              rows={3}
            />
            <p className="hint">One per line, max 5. Spoken verbatim to unscreened callers. You can edit these later on the Dashboard.</p>
          </div>

          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input type="checkbox" id="emailNotifs" checked={emailNotifs} onChange={e => setEmailNotifs(e.target.checked)} style={{ width: 'auto' }} />
            <label htmlFor="emailNotifs" style={{ margin: 0, textTransform: 'none', letterSpacing: 'normal', fontSize: '0.9rem', color: 'var(--color-text)' }}>Email me after every call</label>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Saving...' : 'Continue to checkout · 7-day trial → $49/mo'}
          </button>
          <p className="hint" style={{ marginTop: '0.75rem' }}>
            You can add or edit RED/GREEN lists and questions anytime on the Dashboard.
          </p>
        </form>
      </div>
    </main>
  );
}

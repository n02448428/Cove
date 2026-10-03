import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Custom urgent words: if a caller says one of these, the ticket gets
// flagged urgent. Stored on profiles.urgent_keywords (max 50, lowercased).
export default function UrgentWordsField() {
  const [words, setWords] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('urgent_keywords')
        .eq('id', user.id)
        .maybeSingle();
      setWords((data?.urgent_keywords || []).join(', '));
    }
    load();
  }, []);

  async function save() {
    setError('');
    setNote('');
    const list = (words || '')
      .split(',')
      .map(w => w.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 50);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const { error } = await supabase.from('profiles').update({ urgent_keywords: list }).eq('id', user.id);
      if (error) throw error;
      setWords(list.join(', '));
      setNote('Saved. Calls mentioning these will be marked urgent.');
    } catch (err) {
      setError(err.message || "Couldn't save that. Try again.");
    }
  }

  return (
    <div>
      <h3 className="kernel-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Words that mean urgent</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.6rem' }}>
        If a caller says one of these, the ticket gets flagged urgent. Separate with commas — e.g. urgent, emergency.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <input
          value={words}
          onChange={e => { setWords(e.target.value); setNote(''); }}
          placeholder="urgent, emergency"
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Words that mean urgent"
        />
        <button className="btn btn-primary" onClick={save}>Save</button>
      </div>
      {note && <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>{note}</p>}
      {error && <p className="error-msg" style={{ marginTop: '0.4rem' }}>{error}</p>}
    </div>
  );
}

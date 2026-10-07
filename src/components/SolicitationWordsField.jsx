import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Custom solicitation phrases: if a caller says one of these, the ticket gets
// classified as solicitation. Stored on profiles.solicitation_keywords (max 50, lowercased).
// These stack on the built-in solicitation phrases.
export default function SolicitationWordsField() {
  const [words, setWords] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('solicitation_keywords')
        .eq('id', user.id)
        .maybeSingle();
      setWords((data?.solicitation_keywords || []).join(', '));
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
      const { error } = await supabase.from('profiles').update({ solicitation_keywords: list }).eq('id', user.id);
      if (error) throw error;
      setWords(list.join(', '));
      setNote('Saved. Calls mentioning these will be marked as solicitation.');
    } catch (err) {
      setError(err.message || "Couldn't save that. Try again.");
    }
  }

  return (
    <div>
      <h3 className="kernel-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Phrases that mean solicitation</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.6rem' }}>
        If a caller says one of these, the ticket gets classified as solicitation. Separate with commas — e.g. extended warranty, timeshare.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <input
          value={words}
          onChange={e => { setWords(e.target.value); setNote(''); }}
          placeholder="extended warranty, timeshare"
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Phrases that mean solicitation"
        />
        <button className="btn btn-primary" onClick={save}>Save</button>
      </div>
      {note && <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>{note}</p>}
      {error && <p className="error-msg" style={{ marginTop: '0.4rem' }}>{error}</p>}
    </div>
  );
}

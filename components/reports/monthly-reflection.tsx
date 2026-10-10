"use client";
import { useState } from 'react';
export function MonthlyReflection({ month, notes, unavailable = false }: { month: string; notes: string; unavailable?: boolean }) {
  const [draft, setDraft] = useState(notes), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function save() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/v1/reflections/${month}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: draft }) });
      if (!response.ok) throw new Error('Could not save. Your draft is still here.');
      setMessage('Reflection saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save.'); }
    finally { setBusy(false); }
  }
  return <section className="surface reflection">
    <h2>Reflection · {month}</h2>
    <p className="muted">Notes from you and Dots, organized by month. Select a previous month to revisit it.</p>
    {unavailable && <p role="alert">This reflection could not load. Refresh before editing.</p>}
    <label className="workflow-field" htmlFor="monthly-reflection">Monthly notes</label>
    <textarea id="monthly-reflection" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={5000} rows={6} disabled={unavailable} placeholder="No reflection saved for this month yet." />
    <button className="solid-button" disabled={busy || unavailable || !draft.trim()} onClick={save}>{busy ? 'Saving…' : 'Save reflection'}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}

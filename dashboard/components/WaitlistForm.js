// Waitlist signup form. Client component: posts the email to
// /api/waitlist and reports the honest outcome, joined, already on the
// list, or a plain error. No optimistic fiction.
'use client';

import { useState } from 'react';

export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  // idle | sending | joined | already | invalid | error
  const [state, setState] = useState('idle');

  async function submit(e) {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    let res;
    try {
      res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      setState('error');
      return;
    }
    if (res.status === 201) setState('joined');
    else if (res.status === 200) setState('already');
    else if (res.status === 400) setState('invalid');
    else setState('error');
  }

  if (state === 'joined') {
    return (
      <p className="waitlist-done" role="status">
        You are on the list. We will write when your turn comes.
      </p>
    );
  }
  if (state === 'already') {
    return (
      <p className="waitlist-done" role="status">
        This email is already on the list. Nothing more to do.
      </p>
    );
  }

  return (
    <form className="waitlist-form" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="waitlist-email">
        Email address
      </label>
      <input
        id="waitlist-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={state === 'sending'}
      />
      <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
        {state === 'sending' ? 'Joining…' : 'Join the waitlist'}
      </button>
      {state === 'invalid' && (
        <p className="error" role="alert">That does not look like an email address.</p>
      )}
      {state === 'error' && (
        <p className="error" role="alert">Something went wrong. Try again in a minute.</p>
      )}
    </form>
  );
}

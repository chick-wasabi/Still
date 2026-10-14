import React, { useState } from 'react';
import { ArrowRight, Leaf, LockKeyhole, ShieldCheck } from 'lucide-react';
export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  async function submit(event) {
    event.preventDefault();
    if (Date.now() < retryAt) {
      setError('Please wait a few seconds before trying again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onUnlock(pin);
    } catch {
      const next = attempts + 1;
      setAttempts(next);
      setPin('');
      if (next % 5 === 0) {
        setRetryAt(Date.now() + 30000);
        setError('Too many attempts. Please wait 30 seconds.');
      } else setError('That PIN didn’t unlock your workspace. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="lock-screen">
      <div className="lock-brand">
        <Leaf size={26} />
        still<span>.</span>
      </div>
      <section className="lock-card">
        <div className="lock-symbol">
          <LockKeyhole size={30} />
        </div>
        <span className="eyebrow">A SPACE THAT’S ONLY YOURS</span>
        <h1>Welcome back.</h1>
        <p>
          Your thoughts are right where you left them.
          <br />
          Enter your PIN to settle in.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="unlock-pin">Your PIN</label>
          <input
            id="unlock-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            pattern="[0-9]{6,12}"
            minLength={6}
            maxLength={12}
            required
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            disabled={busy}
          />
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy ? 'Unlocking…' : 'Unlock your space'}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="lock-assurance">
          <ShieldCheck size={15} />
          Encrypted. Private. On this device.
        </div>
      </section>
      <p className="lock-footnote">
        No PIN recovery is available. Your data stays locked until you enter the correct PIN.
      </p>
    </main>
  );
}

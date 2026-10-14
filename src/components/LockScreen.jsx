import React, { useState } from 'react';
import { ArrowRight, Leaf, LockKeyhole, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';
import SanctuaryScene from './SanctuaryScene';
export default function LockScreen({ onUnlock, onRecover, recoveryAvailable, recoveryPrompt }) {
  const [pin, setPin] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [mode, setMode] = useState('pin'),
    [answer, setAnswer] = useState(''),
    [showHint, setShowHint] = useState(false);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [attempts, setAttempts] = useState(0),
    [retryAt, setRetryAt] = useState(0);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (Date.now() < retryAt) {
      setError('Please wait before trying again.');
      return;
    }
    if (mode === 'recover' && pin !== confirmation) {
      setError('Your new PINs don’t match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'recover') await onRecover(answer, pin);
      else await onUnlock(pin);
    } catch (problem) {
      const next = attempts + 1;
      setAttempts(next);
      if (mode === 'pin') setPin('');
      if (next % 5 === 0) {
        setRetryAt(Date.now() + 30000);
        setError('Too many attempts. Please wait 30 seconds.');
      } else
        setError(
          mode === 'recover'
            ? problem.message
            : 'That PIN didn’t unlock your workspace. Try again.',
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="lock-screen sanctuary-lock">
      <SanctuaryScene night />
      <div className="lock-composition">
        <div className="lock-brand">
          <span className="lock-leaf">
            <Leaf size={51} strokeWidth={1.2} />
          </span>
          <h1>
            still<span>.</span>
          </h1>
        </div>
        <p className="sanctuary-tagline">A quiet place to come back to yourself.</p>
        <section className="lock-card">
          <div className="lock-card-heading">
            {mode === 'pin' ? <LockKeyhole size={20} /> : <KeyRound size={20} />}
            <h2>{mode === 'pin' ? 'Your sanctuary awaits.' : 'Find your way back.'}</h2>
          </div>
          {mode === 'recover' && (
            <div className="recovery-prompt">
              {recoveryAvailable ? (
                <>
                  <p className="recovery-question">{recoveryPrompt.question}</p>
                  {recoveryPrompt.hint && (
                    <>
                      <button
                        className="text-button hint-toggle"
                        onClick={() => setShowHint(!showHint)}
                      >
                        {showHint ? 'Hide hint' : 'Show hint'}
                      </button>
                      {showHint && <p className="recovery-hint">{recoveryPrompt.hint}</p>}
                    </>
                  )}
                </>
              ) : (
                <p>
                  Local recovery wasn’t enabled for this vault. You’ll need your existing PIN to
                  unlock it.
                </p>
              )}
            </div>
          )}
          {(mode === 'pin' || recoveryAvailable) && (
            <form onSubmit={submit}>
              {mode === 'recover' && (
                <label>
                  Recovery answer
                  <input
                    type="password"
                    autoComplete="off"
                    required
                    minLength={12}
                    maxLength={256}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    disabled={busy}
                    placeholder="Your private answer or phrase"
                  />
                </label>
              )}
              <label htmlFor="unlock-pin">{mode === 'pin' ? 'Your PIN' : 'New PIN'}</label>
              <input
                id="unlock-pin"
                type="password"
                inputMode="numeric"
                autoComplete={mode === 'pin' ? 'current-password' : 'new-password'}
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
              {mode === 'recover' && (
                <label>
                  Confirm new PIN
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    minLength={6}
                    maxLength={12}
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ''))}
                    disabled={busy}
                  />
                </label>
              )}
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <button className="primary-button" disabled={busy}>
                {busy
                  ? 'Opening your sanctuary…'
                  : mode === 'pin'
                    ? 'Enter your sanctuary'
                    : 'Reset PIN & unlock'}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          <button
            className="forgot-pin text-button"
            disabled={busy}
            onClick={() => {
              setMode(mode === 'pin' ? 'recover' : 'pin');
              setPin('');
              setConfirmation('');
              setAnswer('');
              setError('');
            }}
          >
            {mode === 'pin' ? (
              'Forgot your PIN?'
            ) : (
              <>
                <ArrowLeft size={15} />
                Back to PIN
              </>
            )}
          </button>
          <div className="lock-assurance">
            <ShieldCheck size={15} />
            Your thoughts stay encrypted on this device.
          </div>
        </section>
        <span className="lock-caption">LEAVE THE NOISE OUTSIDE.</span>
      </div>
    </main>
  );
}

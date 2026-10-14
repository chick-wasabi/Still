import React, { useState } from 'react';
import { Check, ShieldCheck, LockKeyhole } from 'lucide-react';
import Modal from './Modal';
import EmojiPicker from './EmojiPicker';
export default function Settings({ profile, onProfile, protectedByPin, setPin, onClose }) {
  const [draft, setDraft] = useState(profile);
  const [pin, setValue] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function protect(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (pin !== confirmation) {
      setError('The PINs don’t match. Try again.');
      return;
    }
    setBusy(true);
    try {
      await setPin(pin);
      setValue('');
      setConfirmation('');
      setMessage('PIN protection is on. Your workspace is encrypted on this device.');
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }
  async function removePin() {
    if (
      !confirm(
        'Turn off PIN protection? Workspace data will be stored without encryption on this device.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await setPin('');
      setMessage('PIN protection is off.');
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Your space, your way"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="settings-content">
        <div className="settings-intro">
          <span className="eyebrow">PERSONALIZE STILL</span>
          <h2>Make yourself at home.</h2>
          <p>A workspace that feels like you.</p>
        </div>
        <form
          className="settings-section"
          onSubmit={(event) => {
            event.preventDefault();
            onProfile({ ...draft, name: draft.name.trim() });
            setMessage('Your profile has been updated.');
          }}
        >
          <div className="profile-editor">
            <EmojiPicker
              value={draft.avatar}
              onChange={(avatar) => setDraft({ ...draft, avatar })}
              label="Choose avatar"
            />
            <div>
              <strong>Your avatar</strong>
              <p>Pick an emoji that feels like you.</p>
            </div>
          </div>
          <label>
            Your name
            <input
              disabled={busy}
              autoComplete="given-name"
              maxLength={60}
              placeholder="What should we call you?"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <button type="submit" disabled={busy} className="primary-button">
            <Check size={17} />
            Save profile
          </button>
        </form>
        <div className="settings-section">
          <div className="security-title">
            <ShieldCheck size={21} />
            <h3>Privacy & security</h3>
            <span className={`security-badge ${protectedByPin ? 'enabled' : ''}`}>
              {protectedByPin ? 'Protected' : 'Optional'}
            </span>
          </div>
          <p>
            Lock Still on startup with a 6–12 digit PIN. Your journal, tasks, habits, and profile
            are encrypted in this browser. A longer PIN is stronger.
          </p>
          <p className="security-note">
            There is no PIN recovery. This protects stored data, but cannot protect an unlocked
            session or a compromised device. Keep a private backup of important writing.
          </p>
          <form onSubmit={protect} className="pin-form">
            <div className="form-row">
              <label>
                {protectedByPin ? 'New PIN' : 'Create PIN'}
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{6,12}"
                  minLength={6}
                  maxLength={12}
                  required
                  value={pin}
                  onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
                  placeholder="6–12 digits"
                />
              </label>
              <label>
                Confirm PIN
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  maxLength={12}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ''))}
                  placeholder="Enter again"
                />
              </label>
            </div>
            <div className="settings-actions">
              <button type="submit" className="secondary-button" disabled={busy}>
                <LockKeyhole size={16} />
                {busy ? 'Securing…' : protectedByPin ? 'Change PIN' : 'Enable PIN lock'}
              </button>
              {protectedByPin && (
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={removePin}
                >
                  Turn off lock
                </button>
              )}
            </div>
          </form>
        </div>
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

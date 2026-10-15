import React, { useState } from 'react';
import { Check, ShieldCheck, LockKeyhole, KeyRound, ChevronDown } from 'lucide-react';
import Modal from './Modal';
import EmojiPicker from './EmojiPicker';
export default function Settings({
  profile,
  soundEnabled = false,
  toggleSound,
  onProfile,
  protectedByPin,
  setPin,
  recoveryQuestion,
  configureRecovery,
  disableRecovery,
  onClose,
}) {
  const [draft, setDraft] = useState(profile),
    [oldPin, setOldPin] = useState(''),
    [pin, setValue] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [recoveryOpen, setRecoveryOpen] = useState(false),
    [question, setQuestion] = useState(''),
    [answer, setAnswer] = useState(''),
    [answerAgain, setAnswerAgain] = useState(''),
    [hint, setHint] = useState(''),
    [recoveryPin, setRecoveryPin] = useState('');
  async function run(action) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await action();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }
  function protect(event) {
    event.preventDefault();
    if (pin !== confirmation) {
      setError('The PINs don’t match. Try again.');
      return;
    }
    run(async () => {
      await setPin(pin, oldPin);
      setValue('');
      setConfirmation('');
      setOldPin('');
      setMessage('PIN protection is on. Your workspace is encrypted on this device.');
    });
  }
  function removePin() {
    if (!oldPin) {
      setError('Enter your old PIN before turning off protection.');
      return;
    }
    if (
      !confirm(
        'Turn off PIN protection and local recovery? Workspace data will be stored without encryption on this device.',
      )
    )
      return;
    run(async () => {
      await setPin('', oldPin);
      setOldPin('');
      setMessage('PIN protection is off.');
    });
  }
  function saveRecovery(event) {
    event.preventDefault();
    if (answer !== answerAgain) {
      setError('Your recovery answers don’t match.');
      return;
    }
    run(async () => {
      await configureRecovery({ question, answer, hint }, recoveryPin);
      setAnswer('');
      setAnswerAgain('');
      setRecoveryPin('');
      setRecoveryOpen(false);
      setMessage('Local recovery is enabled. Keep your private answer somewhere safe.');
    });
  }
  function removeRecovery() {
    if (!recoveryPin) {
      setError('Enter your current PIN to turn off recovery.');
      return;
    }
    if (!confirm('Remove local recovery? You will need your PIN to open this device.')) return;
    run(async () => {
      await disableRecovery(recoveryPin);
      setRecoveryPin('');
      setRecoveryOpen(false);
      setMessage('Local recovery is off.');
    });
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
          <span className="eyebrow">PERSONALIZE YOUR SANCTUARY</span>
          <h2>Make yourself at home.</h2>
        </div>
        <form
          className="settings-section"
          onSubmit={(event) => {
            event.preventDefault();
            onProfile({ ...draft, name: draft.name.trim(), avatar: draft.avatar || '✦' });
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
              <p>A little reflection of you.</p>
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
          <p>One PIN protects all your spaces. Your writing stays encrypted on this device.</p>
          <form onSubmit={protect} className="pin-form">
            {protectedByPin && (
              <label className="field-label">
                Old PIN
                <input
                  disabled={busy}
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  minLength={6}
                  maxLength={12}
                  required
                  value={oldPin}
                  onChange={(event) => setOldPin(event.target.value.replace(/\D/g, ''))}
                  placeholder="Your current PIN"
                />
              </label>
            )}
            <div className="form-row">
              <label>
                {protectedByPin ? 'New PIN' : 'Create PIN'}
                <input
                  disabled={busy}
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
                  disabled={busy}
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
        {protectedByPin && (
          <section className="settings-section recovery-settings">
            <div className="security-title">
              <KeyRound size={21} />
              <h3>Local recovery</h3>
              <span className={`security-badge ${recoveryQuestion ? 'enabled' : ''}`}>
                {recoveryQuestion ? 'Enabled' : 'Not set'}
              </span>
            </div>
            <p>
              A question to guide you back. A private answer to unlock your vault. No email or
              server needed.
            </p>
            {recoveryQuestion && (
              <div className="recovery-question-preview">{recoveryQuestion}</div>
            )}
            <button
              type="button"
              disabled={busy}
              className="secondary-button recovery-open"
              aria-expanded={recoveryOpen}
              onClick={() => setRecoveryOpen(!recoveryOpen)}
            >
              {recoveryQuestion ? 'Manage recovery' : 'Set up local recovery'}
              <ChevronDown size={16} />
            </button>
            {recoveryOpen && (
              <form className="recovery-form" onSubmit={saveRecovery}>
                <p className="security-note">
                  Your question and hint are visible while locked. Use a private answer or phrase
                  with at least 12 characters, not a publicly known fact. Answers are
                  case-sensitive. Clearing browser storage removes the vault and its recovery copy.
                </p>
                <label>
                  Current PIN for recovery
                  <input
                    disabled={busy}
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    minLength={6}
                    maxLength={12}
                    required
                    value={recoveryPin}
                    onChange={(event) => setRecoveryPin(event.target.value.replace(/\D/g, ''))}
                  />
                </label>
                <label>
                  Recovery question
                  <input
                    disabled={busy}
                    required
                    maxLength={200}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="A prompt only you can answer privately"
                  />
                </label>
                <label>
                  Private recovery answer
                  <input
                    disabled={busy}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={256}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="A memorable secret phrase"
                  />
                </label>
                <label>
                  Confirm recovery answer
                  <input
                    disabled={busy}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={256}
                    value={answerAgain}
                    onChange={(event) => setAnswerAgain(event.target.value)}
                  />
                </label>
                <label>
                  Hint (optional, visible while locked)
                  <input
                    disabled={busy}
                    maxLength={200}
                    value={hint}
                    onChange={(event) => setHint(event.target.value)}
                    placeholder="A gentle clue, never your answer"
                  />
                </label>
                <div className="settings-actions">
                  <button type="submit" className="primary-button" disabled={busy}>
                    <KeyRound size={17} />
                    {busy ? 'Securing…' : 'Save local recovery'}
                  </button>
                  {recoveryQuestion && (
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={busy}
                      onClick={removeRecovery}
                    >
                      Remove recovery
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>
        )}
        <section className="settings-section companion-sounds">
          <h3>Companion sounds</h3>
          <p>Soft purring and sleepy breathing. Quiet by default.</p>
          <label>
            <input type="checkbox" checked={soundEnabled} onChange={toggleSound} /> Enable companion
            sounds
          </label>
        </section>
        <section className="settings-section">
          <details className="companion-credits">
            <summary>About &amp; credits</summary>
            <p>Still’s animated tabby brings a little mischief to your sanctuary.</p>
            <p>
              Animation rig and clips:{' '}
              <a
                href="https://sketchfab.com/3d-models/sphynx-cat-rigged-animated-10-anims-0b86bde7a8b64fd7a459035b339a790f"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sphynx Cat – Rigged &amp; Animated (10 Anims)
              </a>{' '}
              by{' '}
              <a
                href="https://sketchfab.com/animalanimator"
                target="_blank"
                rel="noopener noreferrer"
              >
                Animal Animator
              </a>
              , licensed under{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                CC BY 4.0
              </a>
              .
            </p>
            <p>
              Tabby model and textures:{' '}
              <a
                href="https://sketchfab.com/3d-models/realistic-cat-pets-for-your-project-ec407d89f7304194bc04f2b4710eab8c"
                target="_blank"
                rel="noopener noreferrer"
              >
                Realistic cat – Pets for your project
              </a>{' '}
              by{' '}
              <a
                href="https://sketchfab.com/micaelrmartins"
                target="_blank"
                rel="noopener noreferrer"
              >
                Micael Martins
              </a>
              , under the{' '}
              <a href="https://sketchfab.com/licenses" target="_blank" rel="noopener noreferrer">
                Sketchfab Standard License
              </a>
              .
            </p>
            <p>
              Adapted for Still: fitted skeleton, transferred skin weights, optimized textures and
              materials, custom poses, scale, and interactive physics. The creators do not endorse
              Still.
            </p>
          </details>
        </section>
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

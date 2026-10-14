import React, { useId, useState } from 'react';
const EMOJIS = [
  '✦',
  '🌿',
  '🌱',
  '🌻',
  '🌙',
  '☀️',
  '✨',
  '🪴',
  '🪐',
  '🌊',
  '🦋',
  '🦊',
  '🐈',
  '🐻',
  '🧘',
  '🎨',
  '🎧',
  '📚',
  '📁',
  '📝',
  '💡',
  '💼',
  '🎯',
  '🏃',
  '☕',
  '💜',
  '🤍',
  '😊',
  '🙂',
  '🧑‍💻',
  '🧑‍🚀',
  '🪞',
];
export default function EmojiPicker({ value, onChange, label = 'Choose emoji' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="emoji-picker">
      <button
        type="button"
        className="emoji-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {value || '✦'}
      </button>
      {open && (
        <div id={id} className="emoji-popover">
          <div className="emoji-grid">
            {EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                aria-label={`Use ${emoji}`}
                aria-pressed={value === emoji}
                onClick={() => {
                  onChange(emoji);
                  setOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <label>
            Custom emoji
            <input
              aria-label="Custom emoji"
              value={value}
              maxLength={20}
              onChange={(event) => onChange(event.target.value)}
            />
          </label>
          <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

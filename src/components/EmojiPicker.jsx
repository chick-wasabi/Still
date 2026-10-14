import React, { useId, useState } from 'react';
import { Smile, X } from 'lucide-react';
const GROUPS = {
  Nature: [
    '🌿',
    '🌱',
    '🌻',
    '🌼',
    '🌸',
    '🌺',
    '🪷',
    '🍃',
    '🍂',
    '🍁',
    '🌳',
    '🌲',
    '🪴',
    '🌵',
    '🍄',
    '🌾',
    '☀️',
    '🌤️',
    '🌙',
    '⭐',
    '✨',
    '🌈',
    '🌊',
    '🏔️',
    '🔥',
    '❄️',
    '🌧️',
    '🪐',
  ],
  Companions: [
    '🐈',
    '🐈‍⬛',
    '🦊',
    '🐻',
    '🐼',
    '🐨',
    '🦋',
    '🐝',
    '🐞',
    '🕊️',
    '🦉',
    '🐢',
    '🐌',
    '🐋',
    '🐬',
    '🦦',
    '🐇',
    '🦌',
    '🐕',
    '🦎',
    '🦜',
    '🪿',
  ],
  Everyday: [
    '✦',
    '📚',
    '📝',
    '📁',
    '💡',
    '💼',
    '🎯',
    '☕',
    '🍵',
    '🎨',
    '🎧',
    '🎵',
    '📷',
    '🕯️',
    '🪞',
    '🧘',
    '🏃',
    '🚲',
    '🧑‍💻',
    '🧑‍🚀',
    '🗺️',
    '✈️',
    '🏡',
    '🛶',
    '🛌',
    '🥑',
    '🍋',
    '🍊',
  ],
  Feelings: [
    '😊',
    '😌',
    '🙂',
    '🥹',
    '🤗',
    '😴',
    '🤍',
    '💜',
    '💚',
    '🧡',
    '💛',
    '🩵',
    '💫',
    '🫶',
    '💭',
    '🧠',
    '🕊️',
    '🎈',
    '🎉',
    '💌',
  ],
};
export default function EmojiPicker({ value, onChange, label = 'Choose emoji' }) {
  const [open, setOpen] = useState(false),
    [group, setGroup] = useState('Nature');
  const id = useId();
  return (
    <div className="emoji-picker">
      <button
        type="button"
        className={`emoji-trigger ${!value ? 'no-emoji' : ''}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {value || <Smile size={23} strokeWidth={1.4} />}
      </button>
      {open && (
        <div id={id} className="emoji-popover">
          <div className="emoji-picker-top">
            <span>Choose a little personality</span>
            <button
              type="button"
              className="tiny-button"
              aria-label="Close emoji picker"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="emoji-categories">
            {Object.keys(GROUPS).map((category) => (
              <button
                type="button"
                key={category}
                aria-pressed={group === category}
                onClick={() => setGroup(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="emoji-grid">
            {GROUPS[group].map((emoji) => (
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
          <button
            type="button"
            className="emoji-none"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            None — keep it simple
          </button>
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

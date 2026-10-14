import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
export default function WorkspaceSwitcher({ spaces, activeSpaceId, onSwitch, compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = spaces.find((space) => space.id === activeSpaceId);
  useEffect(() => {
    if (!open) return;
    const click = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        ref.current?.querySelector('button').focus();
      }
    };
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className={`workspace-switcher ${compact ? 'compact' : ''}`} ref={ref}>
      <button
        className={compact ? 'icon-button' : 'workspace-switch'}
        aria-label={`Switch workspace, current: ${selected?.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <span className="workspace-avatar">{selected?.emoji}</span>
        {!compact && (
          <>
            <span>
              {selected?.name}
              <small>Your own little corner</small>
            </span>
            <ChevronDown size={15} />
          </>
        )}
      </button>
      {open && (
        <div className="workspace-menu" role="menu" aria-label="Choose workspace">
          <span className="nav-caption">YOUR SPACES</span>
          {spaces.map((space) => (
            <button
              role="menuitemradio"
              aria-checked={space.id === activeSpaceId}
              key={space.id}
              onClick={() => {
                onSwitch(space.id);
                setOpen(false);
              }}
            >
              <span>{space.emoji}</span>
              <div>
                {space.name}
                <small>
                  {space.id === 'personal'
                    ? 'Life, in your own words'
                    : 'Make room for your next idea'}
                </small>
              </div>
              {space.id === activeSpaceId && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

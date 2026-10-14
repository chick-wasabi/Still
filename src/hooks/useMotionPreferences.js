import { useState } from 'react';
const KEY = 'still-motion-preferences';
export default function useMotionPreferences() {
  const [catEnabled, setCat] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY))?.catEnabled !== false;
    } catch {
      return true;
    }
  });
  function toggleCat() {
    setCat((current) => {
      const next = !current;
      try {
        localStorage.setItem(KEY, JSON.stringify({ catEnabled: next }));
      } catch {
        /* Motion controls remain usable when storage is full. */
      }
      return next;
    });
  }
  return { catEnabled, toggleCat };
}

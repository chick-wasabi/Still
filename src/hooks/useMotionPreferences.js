import { useState } from 'react';
const KEY = 'still-motion-preferences';
export function readMotionPreferences(storage = localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    return {
      catEnabled: saved?.catEnabled !== false,
      ballEnabled: saved?.ballEnabled === true,
      soundEnabled: saved?.soundEnabled === true,
    };
  } catch {
    return { catEnabled: true, ballEnabled: false, soundEnabled: false };
  }
}
export default function useMotionPreferences() {
  const [preferences, setPreferences] = useState(readMotionPreferences);
  function toggle(key) {
    setPreferences((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* Controls still work with full storage. */
      }
      return next;
    });
  }
  return {
    ...preferences,
    toggleCat: () => toggle('catEnabled'),
    toggleBall: () => toggle('ballEnabled'),
    toggleSound: () => toggle('soundEnabled'),
  };
}

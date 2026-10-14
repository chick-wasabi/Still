import { useSyncExternalStore } from 'react';

let media;
const getMedia = () => (media ??= window.matchMedia('(prefers-reduced-motion: reduce)'));
function subscribe(listener) {
  const query = getMedia();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const snapshot = () => getMedia().matches;
// Subscribe explicitly: the installed Motion hook snapshots the initial preference only.
export default function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

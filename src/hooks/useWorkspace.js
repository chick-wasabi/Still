import { useCallback, useEffect, useRef, useState } from 'react';
import { migrateLegacy } from '../data';
import { STORAGE_KEY, createCredentials, openVault, seal, validateWorkspace } from '../lib/vault';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: validateWorkspace(migrateLegacy(localStorage)), locked: false };
    const saved = JSON.parse(raw);
    if (saved.version !== 2)
      throw new Error('Unsupported workspace format. Your stored data has not been changed.');
    if (saved.encrypted) return { data: null, locked: true };
    return { data: validateWorkspace(saved.data), locked: false };
  } catch (error) {
    return { data: null, locked: false, error: error.message };
  }
}

export default function useWorkspace() {
  const [initial] = useState(load);
  const [data, setData] = useState(initial.data);
  const [locked, setLocked] = useState(initial.locked);
  const [protectedByPin, setProtected] = useState(initial.locked);
  const [error, setError] = useState(initial.error || '');
  const [status, setStatus] = useState('saved');
  const credentials = useRef(null);
  const revision = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  const persist = useCallback(async (snapshot, nextCredentials = credentials.current) => {
    const current = ++revision.current;
    setStatus('saving');
    try {
      const envelope = nextCredentials
        ? await seal(snapshot, nextCredentials)
        : { version: 2, encrypted: false, data: snapshot };
      if (current !== revision.current) return false;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      // Remove legacy plaintext only after the replacement was saved successfully.
      ['notes', 'folders', 'tasks', 'habits'].forEach((type) =>
        localStorage.removeItem(`still-${type}-v1`),
      );
      setStatus('saved');
      setError('');
      return true;
    } catch (problem) {
      setStatus('error');
      setError(
        'Could not save on this device. Browser storage may be full or unavailable. Your current changes are still in memory.',
      );
      throw problem;
    }
  }, []);

  useEffect(() => {
    if (!data || locked) return;
    persist(data).catch(() => {});
  }, [data, locked, persist]);

  useEffect(() => {
    const beforeUnload = (event) => {
      if (status === 'saving') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [status]);

  useEffect(() => {
    function changed(event) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      revision.current += 1;
      credentials.current = null;
      try {
        if (!event.newValue)
          throw new Error('Workspace storage was changed in another tab. Reload to continue.');
        const saved = JSON.parse(event.newValue);
        setProtected(Boolean(saved.encrypted));
        setLocked(Boolean(saved.encrypted));
        setData(saved.encrypted ? null : validateWorkspace(saved.data));
        setStatus('saved');
      } catch (problem) {
        setData(null);
        setError(problem.message);
      }
    }
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  const update = useCallback((field, next) => {
    revision.current += 1;
    setStatus('saving');
    setData((current) => ({
      ...current,
      [field]: typeof next === 'function' ? next(current[field]) : next,
    }));
  }, []);

  async function unlock(pin) {
    const envelope = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const result = await openVault(envelope, pin);
    const snapshot = validateWorkspace(result.data);
    credentials.current = result.credentials;
    setData(snapshot);
    setLocked(false);
    setError('');
  }

  async function setPin(pin) {
    const next = pin ? await createCredentials(pin) : null;
    if (!(await persist(dataRef.current, next)))
      throw new Error('Workspace changed while securing it. Please retry.');
    credentials.current = next;
    setProtected(Boolean(next));
  }

  async function lock() {
    if (!credentials.current) return;
    if (!(await persist(dataRef.current)))
      throw new Error('Workspace changed before locking. Please retry.');
    revision.current += 1;
    credentials.current = null;
    setData(null);
    setLocked(true);
  }

  return {
    data,
    update,
    locked,
    unlock,
    lock,
    protectedByPin,
    setPin,
    error,
    status,
    retrySave: () => persist(dataRef.current).catch(() => {}),
  };
}

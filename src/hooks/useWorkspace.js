import { useCallback, useEffect, useRef, useState } from 'react';
import { migrateLegacy, normalizeSanctuary } from '../data';
import {
  STORAGE_KEY,
  createCredentials,
  openVault,
  seal,
  validateWorkspace,
  createLocalRecovery,
  unlockRecovery,
} from '../lib/vault';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return {
        data: normalizeSanctuary(validateWorkspace(migrateLegacy(localStorage))),
        locked: false,
      };
    const saved = JSON.parse(raw);
    if (saved.version !== 2)
      throw new Error('Unsupported workspace format. Your stored data has not been changed.');
    if (saved.encrypted) return { data: null, locked: true };
    return { data: normalizeSanctuary(validateWorkspace(saved.data)), locked: false };
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
        setData(saved.encrypted ? null : normalizeSanctuary(validateWorkspace(saved.data)));
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
      ...(field === 'profile'
        ? { profile: typeof next === 'function' ? next(current.profile) : next }
        : {
            spaces: current.spaces.map((space) =>
              space.id === current.activeSpaceId
                ? { ...space, [field]: typeof next === 'function' ? next(space[field]) : next }
                : space,
            ),
          }),
    }));
  }, []);

  async function unlock(pin) {
    const envelope = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const result = await openVault(envelope, pin);
    const snapshot = normalizeSanctuary(validateWorkspace(result.data));
    credentials.current = result.credentials;
    setData(snapshot);
    setLocked(false);
    setError('');
  }

  async function setPin(pin, oldPin) {
    if (protectedByPin) {
      try {
        await openVault(JSON.parse(localStorage.getItem(STORAGE_KEY)), oldPin || '');
      } catch {
        throw new Error('Old PIN is incorrect. Your PIN has not been changed.');
      }
    }
    const next = pin ? await createCredentials(pin) : null;
    const snapshot = pin ? dataRef.current : { ...dataRef.current, recovery: null };
    if (!(await persist(snapshot, next)))
      throw new Error('Workspace changed while securing it. Please retry.');
    credentials.current = next;
    setProtected(Boolean(next));
    if (!pin) setData(snapshot);
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
    data: data
      ? { ...data.spaces.find((space) => space.id === data.activeSpaceId), profile: data.profile }
      : null,
    spaces: data?.spaces.map(({ id, name, emoji }) => ({ id, name, emoji })) || [],
    activeSpaceId: data?.activeSpaceId,
    switchSpace: (id) => {
      if (data.spaces.some((space) => space.id === id)) {
        revision.current += 1;
        setStatus('saving');
        setData((current) => ({ ...current, activeSpaceId: id }));
      }
    },
    recoveryQuestion: data?.recovery?.question || '',
    recoveryPrompt: (() => {
      try {
        const record = JSON.parse(localStorage.getItem(STORAGE_KEY))?.recovery;
        return record ? { question: record.question, hint: record.hint } : null;
      } catch {
        return null;
      }
    })(),
    recoveryAvailable: (() => {
      try {
        return Boolean(JSON.parse(localStorage.getItem(STORAGE_KEY))?.recovery);
      } catch {
        return false;
      }
    })(),
    configureRecovery: async ({ question, answer, hint }, oldPin) => {
      if (!credentials.current) throw new Error('Enable a PIN before adding local recovery.');
      try {
        await openVault(JSON.parse(localStorage.getItem(STORAGE_KEY)), oldPin || '');
      } catch {
        throw new Error('Enter your current PIN to configure recovery.');
      }
      const record = await createLocalRecovery(question, answer, hint);
      const snapshot = { ...dataRef.current, recovery: record };
      if (!(await persist(snapshot)))
        throw new Error('The workspace changed. Please retry enabling recovery.');
      setData(snapshot);
    },
    disableRecovery: async (oldPin) => {
      try {
        await openVault(JSON.parse(localStorage.getItem(STORAGE_KEY)), oldPin || '');
      } catch {
        throw new Error('Enter your current PIN to turn off recovery.');
      }
      const snapshot = { ...dataRef.current, recovery: null };
      if (!(await persist(snapshot))) throw new Error('Workspace changed. Please retry.');
      setData(snapshot);
    },
    recover: async (answer, newPin) => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored?.recovery) throw new Error('Local recovery was not enabled for this vault.');
      let snapshot;
      try {
        snapshot = normalizeSanctuary(await unlockRecovery(stored.recovery, answer));
      } catch {
        throw new Error(
          'That recovery answer didn’t unlock this vault. Check your answer and try again.',
        );
      }
      const next = await createCredentials(newPin);
      if (!(await persist(snapshot, next))) throw new Error('Workspace changed. Please retry.');
      credentials.current = next;
      setData(snapshot);
      setProtected(true);
      setLocked(false);
    },
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

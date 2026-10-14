import useReducedMotion from './hooks/useReducedMotion';
import PetCompanion from './components/pet3d/PetCompanion';
import useMotionPreferences from './hooks/useMotionPreferences';
import SanctuaryScene from './components/SanctuaryScene';
import React, { useCallback, useEffect, useMemo, useState, useLayoutEffect } from 'react';
import { motion, MotionConfig, AnimatePresence } from 'framer-motion';
import {
  Cat,
  CircleDot,
  ChevronRight,
  Search,
  Plus,
  Check,
  Feather,
  ArrowUpRight,
  Settings2,
  LockKeyhole,
  AlertCircle,
  X,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import JournalView from './components/JournalView';
import TaskView from './components/TaskView';
import HabitTracker from './components/HabitTracker';
import Editor from './components/Editor';
import Modal from './components/Modal';
import Settings from './components/Settings';
import LockScreen from './components/LockScreen';
import useWorkspace from './hooks/useWorkspace';
import { dateKey } from './data';

function Workspace({ workspace }) {
  const { data, update, locked, unlock, lock, protectedByPin, setPin, error, status } = workspace;
  const [view, setView] = useState('Journal');
  const { catEnabled, ballEnabled, toggleCat, toggleBall } = useMotionPreferences();
  useLayoutEffect(() => {
    document.documentElement.dataset.workspaceTheme =
      workspace.activeSpaceId === 'work' ? 'work' : 'personal';
    return () => {
      delete document.documentElement.dataset.workspaceTheme;
    };
  }, [workspace.activeSpaceId]);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 850);
  const [folder, setFolder] = useState(null);
  const [editor, setEditor] = useState(null);
  const [search, setSearch] = useState(false);
  const [settings, setSettings] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [locking, setLocking] = useState(false);
  const reduced = useReducedMotion();
  const setNotes = useCallback((next) => update('notes', next), [update]);
  const setFolders = useCallback((next) => update('folders', next), [update]);
  const setTasks = useCallback((next) => update('tasks', next), [update]);
  const setHabits = useCallback((next) => update('habits', next), [update]);
  const saveDraft = useCallback(
    (note) =>
      update('drafts', (current) => [
        ...(current || []).filter((item) => item.id !== note.id),
        note,
      ]),
    [update],
  );
  const clearDraft = useCallback(
    (id) => update('drafts', (current) => (current || []).filter((item) => item.id !== id)),
    [update],
  );

  useEffect(() => {
    const keydown = (event) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        data &&
        !locked &&
        !editor &&
        !settings
      ) {
        event.preventDefault();
        setSearch((current) => !current);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [data, locked, editor, settings]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (locked) {
      setEditor(null);
      setSettings(false);
      setSearch(false);
      setQuery('');
      setFolder(null);
    }
  }, [locked]);

  async function lockWorkspace() {
    if (locking) return;
    setLocking(true);
    try {
      await lock();
    } catch {
      setToast('Could not save. Please retry before locking.');
    } finally {
      setLocking(false);
    }
  }
  const searchResults = useMemo(() => {
    if (!data) return { notes: [], tasks: [] };
    const value = query.toLocaleLowerCase().trim();
    return {
      notes: [
        ...new Map([...data.notes, ...(data.drafts || [])].map((note) => [note.id, note])).values(),
      ].filter((note) => `${note.title} ${note.body}`.toLocaleLowerCase().includes(value)),
      tasks: data.tasks.filter((task) =>
        `${task.title} ${task.description}`.toLocaleLowerCase().includes(value),
      ),
    };
  }, [data, query]);

  if (!data)
    return (
      <div className="recovery-screen">
        <AlertCircle size={36} />
        <h1>We couldn’t open this workspace.</h1>
        <p role="alert">{error}</p>
        <p>
          Your stored data has not been replaced. Check that browser storage is available, then
          reload.
        </p>
        <button className="primary-button" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  const { notes, folders, tasks, habits, profile } = data;
  const drafts = data.drafts || [];
  const openNote = (note) => setEditor(drafts.find((item) => item.id === note.id) || note);
  function newNote(date = dateKey()) {
    setEditor({
      id: crypto.randomUUID(),
      title: '',
      body: '',
      emoji: '',
      date,
      folder: null,
      mood: '',
    });
  }
  function openDate(date) {
    const entry = notes.find((note) => note.date === date);
    if (entry) openNote(entry);
    else newNote(date);
  }
  const saveNote = (note) => {
    setNotes((current) =>
      current.some((item) => item.id === note.id)
        ? current.map((item) => (item.id === note.id ? note : item))
        : [note, ...current],
    );
    clearDraft(note.id);
    setEditor(null);
    setToast('Entry added to your workspace.');
  };
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div
        className="app-shell sanctuary-app"
        data-space={workspace.activeSpaceId}
        data-view={view}
      >
        <SanctuaryScene journal={view === 'Journal'} />
        <div className="workspace-shell pet3d-host">
          <Sidebar
            spaces={workspace.spaces}
            activeSpaceId={workspace.activeSpaceId}
            onSwitchSpace={(id) => {
              workspace.switchSpace(id);
              setFolder(null);
              setView('Journal');
            }}
            {...{
              view,
              setView,
              folders,
              setFolders,
              notes,
              setNotes,
              collapsed,
              setCollapsed,
              folder,
              setFolder,
              profile,
              protectedByPin,
            }}
            openNote={openNote}
            openSearch={() => setSearch(true)}
            openSettings={() => setSettings(true)}
            onLock={lockWorkspace}
          />
          <div className="main-shell">
            <header className="topbar">
              <div className="breadcrumbs">
                <span>
                  {workspace.spaces.find((space) => space.id === workspace.activeSpaceId)?.name}{' '}
                  workspace
                </span>
                <ChevronRight size={14} />
                <strong>{view}</strong>
              </div>
              <div className="topbar-right">
                <button
                  className="icon-button companion-toggle"
                  aria-label={catEnabled ? 'Pause cat companion' : 'Resume cat companion'}
                  aria-pressed={catEnabled}
                  title={catEnabled ? 'Pause your cat companion' : 'Bring your cat companion back'}
                  onClick={toggleCat}
                >
                  <Cat size={19} />
                  <span className="companion-toggle-dot" />
                </button>
                <button
                  className="icon-button companion-toggle ball-toggle"
                  aria-label={ballEnabled ? 'Hide play ball' : 'Show play ball'}
                  aria-pressed={ballEnabled}
                  title={ballEnabled ? 'Put the yarn ball away' : 'Play ball'}
                  onClick={toggleBall}
                >
                  <CircleDot size={19} />
                  <span className="companion-toggle-dot" />
                </button>
                <span
                  role="status"
                  className={`save-status ${status === 'error' ? 'save-error' : ''}`}
                >
                  <i />
                  {status === 'saving'
                    ? 'Saving…'
                    : status === 'error'
                      ? 'Not saved'
                      : protectedByPin
                        ? 'Encrypted on this device'
                        : 'Saved on this device'}
                </span>
                {protectedByPin && (
                  <button
                    className="icon-button"
                    aria-label="Lock workspace"
                    disabled={locking}
                    onClick={lockWorkspace}
                  >
                    <LockKeyhole size={19} />
                  </button>
                )}
                <button
                  className="avatar small"
                  aria-label="Open settings"
                  onClick={() => setSettings(true)}
                >
                  {profile.avatar}
                </button>
              </div>
            </header>
            {error && (
              <div className="storage-error" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
                <button className="secondary-button" onClick={workspace.retrySave}>
                  Retry save
                </button>
              </div>
            )}
            <main id="main-content">
              <motion.div
                className="page-transition"
                key={`${workspace.activeSpaceId}-${view}`}
                initial={reduced ? false : { opacity: 0.8, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              >
                {view === 'Journal' ? (
                  <JournalView
                    {...{ notes, folder, folders, openDate, profile, drafts }}
                    openNote={openNote}
                    newNote={() => newNote()}
                    openSettings={() => setSettings(true)}
                  />
                ) : view === 'Tasks' ? (
                  <TaskView {...{ tasks, setTasks }} />
                ) : (
                  <HabitTracker {...{ habits, setHabits }} />
                )}
              </motion.div>
              <footer className="page-footer">
                <span>
                  <span className="footer-logo">✧</span>A little space. A clearer mind.
                </span>
                <button onClick={() => setSettings(true)}>
                  <Settings2 size={15} />
                  Make it yours
                </button>
              </footer>
            </main>
          </div>
          <PetCompanion
            enabled={catEnabled}
            ballEnabled={ballEnabled}
            suspended={Boolean(editor || settings || search)}
            layoutKey={`${workspace.activeSpaceId}-${view}`}
          />
          <button
            className="floating-add"
            aria-label="Add a scratchpad thought"
            title="Quick thought"
            onClick={() => newNote(null)}
          >
            <Feather size={21} />
            <span>Quick thought</span>
            <Plus size={17} />
          </button>
        </div>
        {editor && (
          <Editor
            key={editor.id}
            note={editor}
            folders={folders}
            onClose={() => setEditor(null)}
            onSave={saveNote}
            onDraftChange={saveDraft}
            onDiscard={() => clearDraft(editor.id)}
            onDelete={(id) => {
              setNotes((current) => current.filter((note) => note.id !== id));
              clearDraft(id);
              setEditor(null);
              setToast('Entry deleted.');
            }}
          />
        )}
        {settings && (
          <Settings
            profile={profile}
            onProfile={(next) => update('profile', next)}
            {...{ protectedByPin, setPin }}
            recoveryQuestion={workspace.recoveryQuestion}
            configureRecovery={workspace.configureRecovery}
            disableRecovery={workspace.disableRecovery}
            onClose={() => setSettings(false)}
          />
        )}
        {search && (
          <Modal title="Search your workspace" onClose={() => setSearch(false)}>
            <div className="form-content">
              <div className="search-field">
                <Search size={20} />
                <input
                  autoFocus
                  placeholder="Entries, thoughts, tasks…"
                  aria-label="Search workspace"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              <div className="search-results">
                {searchResults.notes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => {
                      setSearch(false);
                      openNote(note);
                    }}
                  >
                    <span>{note.emoji}</span>
                    <div>
                      {note.title || 'Untitled'}
                      <small>Journal · {note.date || 'Scratchpad'}</small>
                    </div>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
                {searchResults.tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => {
                      setView('Tasks');
                      setSearch(false);
                    }}
                  >
                    <Check size={19} />
                    <div>
                      {task.title}
                      <small>Task · {task.status}</small>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                ))}
                {!searchResults.notes.length && !searchResults.tasks.length && (
                  <div className="search-empty">
                    <Search size={25} />
                    <h3>
                      {query ? 'Nothing here just yet.' : 'Your workspace is a blank canvas.'}
                    </h3>
                    <p>
                      {query
                        ? 'Try another word or phrase.'
                        : 'Your entries and tasks will appear here as you create them.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Modal>
        )}
        {toast && (
          <div role="status" className="toast">
            <Check size={17} />
            {toast}
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

export default function App() {
  const workspace = useWorkspace();
  const reduced = useReducedMotion();
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <AnimatePresence initial={false}>
        {workspace.locked ? (
          <motion.div
            key="lock"
            className="lock-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 1.025 }}
            transition={{ duration: reduced ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <LockScreen
              onUnlock={workspace.unlock}
              onRecover={workspace.recover}
              recoveryAvailable={workspace.recoveryAvailable}
              recoveryPrompt={workspace.recoveryPrompt}
            />
          </motion.div>
        ) : (
          <motion.div
            key="workspace"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.5 }}
          >
            <Workspace workspace={workspace} />
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

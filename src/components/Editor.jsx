import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
const MarkdownPreview = lazy(() => import('./MarkdownPreview'));
import {
  Bold,
  Italic,
  List,
  Code,
  Trash2,
  Check,
  CalendarDays,
  Eye,
  PencilLine,
} from 'lucide-react';
import Modal from './Modal';
import EmojiPicker from './EmojiPicker';
export default function Editor({
  note,
  folders,
  onSave,
  onClose,
  onDelete,
  onDraftChange,
  onDiscard,
}) {
  const [draft, setDraft] = useState({ ...note });
  const [preview, setPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const area = useRef(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(note);
  const close = () => {
    if (!dirty) {
      onClose();
      return;
    }
    if (confirm('Discard this draft’s unsaved changes?')) {
      onDiscard?.();
      onClose();
    }
  };
  const pending = useRef(false);
  useEffect(() => {
    if (!dirty || !onDraftChange) return;
    pending.current = true;
    const timer = setTimeout(() => {
      pending.current = false;
      onDraftChange(draft);
    }, 350);
    return () => {
      clearTimeout(timer);
      pending.current = false;
    };
  }, [draft, dirty, onDraftChange]);
  useEffect(() => {
    const warn = (event) => {
      if (pending.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function format(before, after = before) {
    const input = area.current;
    if (!input) return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    const selected = draft.body.slice(start, end);
    const insert =
      before === '- '
        ? selected
            .split('\n')
            .map((line) => `- ${line}`)
            .join('\n')
        : before + selected + after;
    setDraft((current) => ({
      ...current,
      body: current.body.slice(0, start) + insert + current.body.slice(end),
    }));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(
        start + before.length,
        before === '- ' ? start + insert.length : start + before.length + selected.length,
      );
    });
  }
  return (
    <Modal
      title={note.date ? 'A moment for yourself' : 'A thought, without a date'}
      onClose={close}
      wide
    >
      <div className="editor-content">
        <div className="editor-meta">
          <EmojiPicker
            label="Entry emoji"
            value={draft.emoji}
            onChange={(emoji) => setDraft({ ...draft, emoji })}
          />
          <label>
            <CalendarDays size={17} />
            <input
              aria-label="Entry date"
              type="date"
              value={draft.date || ''}
              onChange={(event) => setDraft({ ...draft, date: event.target.value || null })}
            />
          </label>
        </div>
        <input
          autoFocus
          className="title-input"
          placeholder="Give this moment a name…"
          aria-label="Entry title"
          maxLength={200}
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <div className="editor-selects">
          <label className="sr-only" htmlFor="note-folder">
            Folder
          </label>
          <select
            id="note-folder"
            value={folders.some((folder) => folder.id === draft.folder) ? draft.folder : ''}
            onChange={(event) => setDraft({ ...draft, folder: event.target.value || null })}
          >
            <option value="">No collection</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.emoji} {folder.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="note-mood">
            Mood
          </label>
          <select
            id="note-mood"
            value={draft.mood}
            onChange={(event) => setDraft({ ...draft, mood: event.target.value })}
          >
            <option value="">No mood</option>
            {['Peaceful', 'Inspired', 'Grateful', 'Thoughtful', 'Happy', 'Tired', 'Anxious'].map(
              (mood) => (
                <option key={mood}>{mood}</option>
              ),
            )}
          </select>
        </div>
        <div className="editor-toolbar">
          <div className="format-buttons">
            {[
              [Bold, 'Bold', '**', '**'],
              [Italic, 'Italic', '_', '_'],
              [List, 'List', '- ', ''],
              [Code, 'Code block', '\n```\n', '\n```\n'],
            ].map(([Icon, label, before, after]) => (
              <button
                key={label}
                title={label}
                aria-label={label}
                disabled={preview}
                onClick={() => format(before, after)}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
          <button
            className={`preview-toggle ${preview ? 'active' : ''}`}
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            {preview ? <PencilLine size={16} /> : <Eye size={16} />}
            <span>{preview ? 'Edit' : 'Preview'}</span>
          </button>
        </div>
        {preview ? (
          <div className="markdown-preview" aria-label="Entry preview">
            <Suspense fallback={<p>Preparing preview…</p>}>
              <MarkdownPreview body={draft.body} />
            </Suspense>
          </div>
        ) : (
          <textarea
            ref={area}
            className="editor-body"
            aria-label="Journal content"
            placeholder="What’s on your mind? Start with a word, a thought, or a moment worth keeping…"
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && ['b', 'i'].includes(event.key)) {
                event.preventDefault();
                format(event.key === 'b' ? '**' : '_');
              }
            }}
          />
        )}
        <footer className="editor-footer">
          {deleting ? (
            <div className="delete-entry-confirm">
              <span>Delete this entry?</span>
              <button className="text-button" onClick={() => setDeleting(false)}>
                Keep
              </button>
              <button className="danger-button" onClick={() => onDelete(note.id)}>
                Delete
              </button>
            </div>
          ) : (
            <>
              <button
                className="icon-button danger"
                aria-label="Delete entry"
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={19} />
              </button>
              <small>
                {draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0} words
                <span> · {dirty ? 'Draft saves automatically' : 'Ready to write'}</span>
              </small>
              <button
                className="primary-button"
                onClick={() =>
                  onSave({
                    ...draft,
                    emoji: draft.emoji,
                    title: draft.title.trim(),
                  })
                }
              >
                <Check size={17} />
                Save entry
              </button>
            </>
          )}
        </footer>
      </div>
    </Modal>
  );
}

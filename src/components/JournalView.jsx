import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Plus, LayoutGrid, List, BookOpen, ArrowRight, Sparkles } from 'lucide-react';
import Calendar from './Calendar';
import EmptyState from './EmptyState';
import { collectionIds } from '../data';
export default function JournalView({
  notes,
  drafts = [],
  openNote,
  openDate,
  newNote,
  folder,
  folders,
  profile,
  openSettings,
}) {
  const [month, setMonth] = useState(() => new Date());
  const [list, setList] = useState(false);
  const [filter, setFilter] = useState('all');
  const shown = useMemo(() => {
    const ids = folder ? collectionIds(folders, folder) : null;
    return notes.filter(
      (note) =>
        (!ids || ids.has(note.folder)) &&
        (filter === 'all' || (filter === 'dated' ? note.date : !note.date)),
    );
  }, [notes, folder, folders, filter]);
  const greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';
  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">
          <span />
          YOUR PERSONAL SANCTUARY
        </div>
        <h1>
          {profile.name ? `${greeting}, ${profile.name.split(' ')[0]}.` : 'A little space for you.'}
          <span className="intro-sparkle">✧</span>
        </h1>
        <p>Clear your mind. Capture a moment. Come back to yourself.</p>
        {!profile.name && (
          <button className="intro-link" onClick={openSettings}>
            Make this space yours
            <ArrowRight size={16} />
          </button>
        )}
      </div>
      <div className="journal-heading">
        <div>
          <h2>
            {folder
              ? `${folders.find((item) => item.id === folder)?.emoji || ''} ${folders.find((item) => item.id === folder)?.name || 'Collection'}`
              : 'Your journal'}
          </h2>
          <p>
            {notes.length
              ? `${notes.length} ${notes.length === 1 ? 'moment' : 'moments'} captured. A little more clarity, one entry at a time.`
              : 'No expectations. Just a place to begin.'}
          </p>
        </div>
        <button data-cat-surface="button" className="primary-button" onClick={newNote}>
          <Plus size={19} />
          New entry
        </button>
      </div>
      <Calendar month={month} setMonth={setMonth} notes={notes} openDate={openDate} />
      {drafts.length > 0 && (
        <section className="draft-tray" aria-label="Journal drafts">
          <div>
            <h3>Pick up where you left off.</h3>
            <span>
              {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}
            </span>
          </div>
          <div className="draft-cards">
            {drafts.map((draft) => (
              <button className="draft-card" key={draft.id} onClick={() => openNote(draft)}>
                <span>{draft.emoji || '✎'}</span>
                <div>
                  <strong>{draft.title || 'Untitled draft'}</strong>
                  <p>{draft.body || 'A quiet blank page.'}</p>
                </div>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="entries-heading">
        <div>
          <h2>
            {folder ? 'In this collection' : 'Your entries'}
            <span>{shown.length}</span>
          </h2>
          <p>{folder ? 'Includes entries in subcollections.' : 'Your moments, kept together.'}</p>
        </div>
        <div className="entry-controls">
          <select
            aria-label="Filter entries"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All entries</option>
            <option value="dated">Journal</option>
            <option value="scratch">Scratchpad</option>
          </select>
          <div className="view-switch">
            <button
              aria-label="Grid view"
              aria-pressed={!list}
              className={!list ? 'selected' : ''}
              onClick={() => setList(false)}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              aria-label="List view"
              aria-pressed={list}
              className={list ? 'selected' : ''}
              onClick={() => setList(true)}
            >
              <List size={19} />
            </button>
          </div>
        </div>
      </div>
      <div className={`entry-grid ${list ? 'entry-list' : ''}`}>
        {shown.map((note) => (
          <button key={note.id} className="entry-card" onClick={() => openNote(note)}>
            <div className="entry-top">
              <span className="entry-icon">
                {note.emoji || <BookOpen size={23} strokeWidth={1.3} />}
              </span>
              <ArrowUpRight size={18} />
            </div>
            <small>
              {note.date
                ? new Date(`${note.date}T12:00:00`).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'UNDATED THOUGHT'}
            </small>
            <h3>{note.title || 'Untitled'}</h3>
            <p>{note.body || 'A moment, made your own.'}</p>
            <div className="entry-footer">
              <span>
                <i />
                {note.mood}
              </span>
              <span>{note.body.trim() ? note.body.trim().split(/\s+/).length : 0} words</span>
            </div>
          </button>
        ))}
        {!shown.length && (
          <EmptyState
            icon={BookOpen}
            title={notes.length ? 'A little room for something new.' : 'Your story starts here.'}
            description={
              notes.length
                ? 'No entries match this view. Add a thought or explore your other collections.'
                : 'A thought, a feeling, a small detail from your day. There’s no right way to begin.'
            }
            action={notes.length ? 'Write an entry' : 'Write your first entry'}
            onAction={newNote}
          />
        )}
      </div>
      <div className="journal-reminder">
        <Sparkles size={17} />
        <span>A few words is enough. This space is yours.</span>
      </div>
    </>
  );
}

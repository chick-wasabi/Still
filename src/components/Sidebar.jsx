import React, { useState } from 'react';
import {
  BookOpen,
  CheckSquare,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  ChevronRight,
  Plus,
  PanelLeftClose,
  Search,
  MoreHorizontal,
  Leaf,
  PanelLeftOpen,
  Settings2,
  LockKeyhole,
  FolderPlus,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
} from 'lucide-react';
import Modal from './Modal';
import EmojiPicker from './EmojiPicker';
import { canMoveFolder } from '../data';
const NAV = [
  ['Journal', BookOpen],
  ['Tasks', CheckSquare],
  ['Habits', ChartNoAxesColumnIncreasing],
];
export default function Sidebar({
  view,
  setView,
  folders,
  setFolders,
  notes,
  setNotes,
  openNote,
  collapsed,
  setCollapsed,
  folder,
  setFolder,
  openSearch,
  profile,
  openSettings,
  onLock,
  protectedByPin,
}) {
  const [closed, setClosed] = useState([]);
  const [menu, setMenu] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const selectView = (name) => {
    setView(name);
    setFolder(null);
    if (innerWidth < 850) setCollapsed(true);
  };
  const createFolder = (parent = null) => {
    setMenu(null);
    setEditing({ id: crypto.randomUUID(), name: '', emoji: '📁', parent });
  };
  function saveFolder(event) {
    event.preventDefault();
    const name = editing.name.trim();
    if (!name || !canMoveFolder(folders, editing.id, editing.parent)) return;
    setFolders((current) =>
      current.some((item) => item.id === editing.id)
        ? current.map((item) => (item.id === editing.id ? { ...editing, name } : item))
        : [...current, { ...editing, name }],
    );
    setClosed((current) => current.filter((id) => id !== editing.parent));
    setEditing(null);
  }
  function removeFolder() {
    setNotes((current) =>
      current.map((note) =>
        note.folder === deleting.id ? { ...note, folder: deleting.parent } : note,
      ),
    );
    setFolders((current) =>
      current
        .filter((item) => item.id !== deleting.id)
        .map((item) => (item.parent === deleting.id ? { ...item, parent: deleting.parent } : item)),
    );
    if (folder === deleting.id) setFolder(null);
    setDeleting(null);
  }
  function reorder(id, target) {
    setFolders((current) => {
      const moving = current.find((item) => item.id === id);
      const destination = current.find((item) => item.id === target);
      if (
        !moving ||
        !destination ||
        id === target ||
        !canMoveFolder(current, id, destination.parent)
      )
        return current;
      const next = current.filter((item) => item.id !== id);
      next.splice(
        next.findIndex((item) => item.id === target),
        0,
        { ...moving, parent: destination.parent },
      );
      return next;
    });
  }
  function shiftFolder(item, direction) {
    const siblings = folders.filter((other) => other.parent === item.parent);
    const target = siblings[siblings.findIndex((other) => other.id === item.id) + direction];
    if (!target) return;
    setFolders((current) => {
      const next = [...current];
      const a = next.findIndex((other) => other.id === item.id),
        b = next.findIndex((other) => other.id === target.id);
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  }
  function dropNote(event, targetFolder, targetNote) {
    const id = event.dataTransfer.getData('note');
    if (!id) return false;
    setNotes((current) => {
      const moving = current.find((item) => item.id === id);
      if (!moving || id === targetNote) return current;
      const next = current.filter((item) => item.id !== id);
      const index = targetNote ? next.findIndex((item) => item.id === targetNote) : next.length;
      next.splice(index, 0, { ...moving, folder: targetFolder });
      return next;
    });
    return true;
  }
  function noteRow(note, depth) {
    return (
      <button
        key={note.id}
        className="tree-note"
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData('note', note.id);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dropNote(event, note.folder, note.id);
        }}
        style={{ '--depth': depth }}
        onClick={() => {
          openNote(note);
          if (innerWidth < 850) setCollapsed(true);
        }}
      >
        <span>{note.emoji}</span>
        <span>{note.title}</span>
      </button>
    );
  }
  function tree(parent = null, depth = 0, ancestors = new Set()) {
    return folders
      .filter((item) => item.parent === parent && !ancestors.has(item.id))
      .map((item) => (
        <div key={item.id}>
          <div
            draggable
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.setData('folder', item.id);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!dropNote(event, item.id)) reorder(event.dataTransfer.getData('folder'), item.id);
            }}
            className={`folder-row ${folder === item.id ? 'selected' : ''}`}
            style={{ '--depth': depth }}
          >
            <button
              className="tree-toggle"
              aria-label={`${closed.includes(item.id) ? 'Expand' : 'Collapse'} ${item.name}`}
              aria-expanded={!closed.includes(item.id)}
              onClick={() =>
                setClosed((current) =>
                  current.includes(item.id)
                    ? current.filter((id) => id !== item.id)
                    : [...current, item.id],
                )
              }
            >
              {closed.includes(item.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              className="folder-name"
              aria-label={`Open collection ${item.name}`}
              onClick={() => {
                setFolder(item.id);
                setView('Journal');
                if (innerWidth < 850) setCollapsed(true);
              }}
            >
              <span>{item.emoji}</span>
              <span>{item.name}</span>
            </button>
            <button
              className="tiny-button"
              aria-label={`Options for ${item.name}`}
              aria-expanded={menu === item.id}
              onClick={() => setMenu(menu === item.id ? null : item.id)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menu === item.id && (
              <div
                className="folder-menu"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setMenu(null);
                }}
              >
                <button
                  onClick={() => {
                    setEditing({ ...item });
                    setMenu(null);
                  }}
                >
                  <Pencil size={14} />
                  Edit collection
                </button>
                <button onClick={() => createFolder(item.id)}>
                  <FolderPlus size={14} />
                  Add subcollection
                </button>
                <button
                  onClick={() => {
                    shiftFolder(item, -1);
                    setMenu(null);
                  }}
                >
                  <ArrowUp size={14} />
                  Move up
                </button>
                <button
                  onClick={() => {
                    shiftFolder(item, 1);
                    setMenu(null);
                  }}
                >
                  <ArrowDown size={14} />
                  Move down
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setDeleting(item);
                    setMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  Delete collection
                </button>
              </div>
            )}
          </div>
          {!closed.includes(item.id) && (
            <>
              {tree(item.id, depth + 1, new Set([...ancestors, item.id]))}
              {notes
                .filter((note) => note.folder === item.id)
                .map((note) => noteRow(note, depth + 1))}
            </>
          )}
        </div>
      ));
  }
  return (
    <>
      <aside
        className={`sidebar ${collapsed ? 'collapsed' : ''}`}
        aria-label="Workspace navigation"
      >
        {collapsed ? (
          <>
            <button
              aria-label="Expand sidebar"
              className="icon-button"
              onClick={() => setCollapsed(false)}
            >
              <PanelLeftOpen size={21} />
            </button>
            <span className="collapsed-separator" />
            {NAV.map(([name, Icon]) => (
              <button
                key={name}
                aria-label={name}
                aria-current={view === name ? 'page' : undefined}
                className={`icon-button ${view === name ? 'active' : ''}`}
                onClick={() => selectView(name)}
              >
                <Icon size={21} />
              </button>
            ))}
            <button aria-label="Search workspace" className="icon-button" onClick={openSearch}>
              <Search size={20} />
            </button>
            <div className="sidebar-bottom">
              <button className="icon-button" aria-label="Open settings" onClick={openSettings}>
                <Settings2 size={20} />
              </button>
              {protectedByPin && (
                <button className="icon-button" aria-label="Lock workspace" onClick={onLock}>
                  <LockKeyhole size={20} />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="brand">
              <div className="brand-mark">
                <Leaf size={25} />
              </div>
              <span>
                still<span className="brand-dot">.</span>
              </span>
              <button
                className="icon-button collapse-button"
                aria-label="Collapse sidebar"
                onClick={() => setCollapsed(true)}
              >
                <PanelLeftClose size={19} />
              </button>
            </div>
            <button
              className="workspace-switch"
              aria-label="Personalize workspace"
              onClick={openSettings}
            >
              <span className="avatar tiny">{profile.avatar}</span>
              <span>
                {profile.name ? `${profile.name.split(' ')[0]}’s space` : 'Your personal space'}
                <small>Make room for what matters</small>
              </span>
              <ChevronDown size={15} />
            </button>
            <button className="search-button" aria-label="Search workspace" onClick={openSearch}>
              <Search size={18} />
              <span>Search workspace</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="nav-caption">WORKSPACE</div>
            <nav>
              {NAV.map(([name, Icon]) => (
                <button
                  key={name}
                  aria-label={name}
                  className={view === name ? 'active' : ''}
                  aria-current={view === name ? 'page' : undefined}
                  onClick={() => selectView(name)}
                >
                  <Icon size={19} />
                  {name}
                  {name === 'Journal' && <span className="nav-count">{notes.length}</span>}
                </button>
              ))}
            </nav>
            <div className="nav-caption folders-title">
              COLLECTIONS
              <button
                className="tiny-button"
                aria-label="Add folder"
                onClick={() => createFolder()}
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="folder-tree">
              {tree()}
              {!folders.length && (
                <button className="create-collection" onClick={() => createFolder()}>
                  <FolderPlus size={18} />
                  <span>
                    Create a collection<small>A home for related thoughts</small>
                  </span>
                </button>
              )}
              {notes.filter(
                (note) => !note.folder || !folders.some((item) => item.id === note.folder),
              ).length > 0 && (
                <div className="unfiled-group">
                  <div className="nav-caption">UNFILED</div>
                  {notes
                    .filter(
                      (note) => !note.folder || !folders.some((item) => item.id === note.folder),
                    )
                    .map((note) => noteRow(note, 0))}
                </div>
              )}
            </div>
            <div className="sidebar-bottom">
              <div className="sidebar-quote">
                <span>✧</span>
                <p>
                  A little reflection.
                  <br />A little more intention.
                </p>
              </div>
              <div className="profile">
                <button
                  className="profile-button"
                  aria-label="Open settings"
                  onClick={openSettings}
                >
                  <span className="avatar">{profile.avatar}</span>
                  <span>
                    {profile.name || 'Make this space yours'}
                    <small>{profile.name ? 'Personal workspace' : 'Set up your profile'}</small>
                  </span>
                  <Settings2 size={17} />
                </button>
                {protectedByPin && (
                  <button className="icon-button" aria-label="Lock workspace" onClick={onLock}>
                    <LockKeyhole size={18} />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </aside>
      {!collapsed && (
        <button
          className="mobile-sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setCollapsed(true)}
        />
      )}
      {editing && (
        <Modal
          title={
            folders.some((item) => item.id === editing.id)
              ? 'Edit collection'
              : 'Create a collection'
          }
          onClose={() => setEditing(null)}
        >
          <form className="form-content" onSubmit={saveFolder}>
            <div className="collection-icon-field">
              <EmojiPicker
                value={editing.emoji}
                onChange={(emoji) => setEditing({ ...editing, emoji })}
              />
              <p>A small icon. A little personality.</p>
            </div>
            <label>
              Collection name
              <input
                autoFocus
                required
                maxLength={80}
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                placeholder="Give your collection a name"
              />
            </label>
            <label>
              Parent collection
              <select
                value={editing.parent || ''}
                onChange={(event) => setEditing({ ...editing, parent: event.target.value || null })}
              >
                <option value="">None — top level</option>
                {folders
                  .filter(
                    (item) => item.id !== editing.id && canMoveFolder(folders, editing.id, item.id),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.emoji} {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary-button" type="submit">
              Save collection
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Delete collection?" onClose={() => setDeleting(null)}>
          <div className="form-content">
            <p>
              “{deleting.name}” will be removed. Its entries and subcollections will move to its
              parent, or to the top level. Your writing will be kept.
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setDeleting(null)}>
                Keep collection
              </button>
              <button className="danger-button" onClick={removeFolder}>
                Delete collection
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

import { isLegacyExample } from './lib/legacy.js';
export const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const emptyWorkspace = () => ({
  profile: { name: '', avatar: '✦' },
  notes: [],
  folders: [],
  tasks: [],
  habits: [],
});

export function currentStreak(completions, today = new Date()) {
  const days = new Set(completions);
  const cursor = new Date(today);
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function canMoveFolder(folders, id, parent) {
  const visited = new Set([id]);
  let ancestor = parent;
  while (ancestor) {
    if (visited.has(ancestor)) return false;
    visited.add(ancestor);
    ancestor = folders.find((folder) => folder.id === ancestor)?.parent;
  }
  return true;
}

export function collectionIds(folders, id) {
  const ids = new Set([id]);
  let previous;
  do {
    previous = ids.size;
    folders.forEach((folder) => {
      if (ids.has(folder.parent)) ids.add(folder.id);
    });
  } while (ids.size !== previous);
  return ids;
}

// Preserve authored and edited v1 items while removing untouched examples.
export function migrateLegacy(storage) {
  const result = emptyWorkspace();
  let legacyFolders = [];
  for (const type of ['notes', 'tasks', 'habits', 'folders']) {
    const raw = storage.getItem(`still-${type}-v1`);
    if (!raw) continue;
    const items = JSON.parse(raw);
    if (!Array.isArray(items))
      throw new Error('Invalid legacy workspace data. Your stored data has not been changed.');
    result[type] = items.filter((item) => !isLegacyExample(item, type));
    if (type === 'folders') legacyFolders = items;
  }
  // Keep original collections when they hold authored notes or subcollections.
  const retained = new Set(
    [
      ...result.notes.map((note) => note.folder),
      ...result.folders.map((folder) => folder.id),
    ].filter(Boolean),
  );
  let size;
  do {
    size = retained.size;
    legacyFolders.forEach((folder) => {
      if (retained.has(folder.id) && folder.parent) retained.add(folder.parent);
    });
  } while (size !== retained.size);
  result.folders = legacyFolders.filter((folder) => retained.has(folder.id));
  const folderIds = new Set(result.folders.map((folder) => folder.id));
  result.folders = result.folders.map((folder) => ({
    ...folder,
    parent: folderIds.has(folder.parent) ? folder.parent : null,
  }));
  result.notes = result.notes.map((note) => ({
    ...note,
    folder: folderIds.has(note.folder) ? note.folder : null,
  }));
  return result;
}

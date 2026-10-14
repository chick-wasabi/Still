import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKey,
  emptyWorkspace,
  currentStreak,
  canMoveFolder,
  collectionIds,
  migrateLegacy,
} from '../src/data.js';
import { createCredentials, seal, openVault } from '../src/lib/vault.js';

test('a new workspace contains no seeded records or name', () => {
  const data = emptyWorkspace();
  for (const field of ['notes', 'folders', 'tasks', 'habits']) assert.deepEqual(data[field], []);
  assert.equal(data.profile.name, '');
});
test('streaks span month boundaries, allow an unfinished today, and reset after a gap', () => {
  const today = new Date(2026, 10, 2, 12);
  assert.equal(currentStreak(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'], today), 4);
  assert.equal(currentStreak(['2026-10-31', '2026-11-01'], today), 2);
  assert.equal(currentStreak(['2026-10-30'], today), 0);
  assert.equal(currentStreak(['2026-11-03'], today), 0);
  assert.equal(dateKey(new Date(2026, 0, 2)), '2026-01-02');
});
test('folder nesting blocks cycles and includes all descendants', () => {
  const folders = [
    { id: 'a', parent: null },
    { id: 'b', parent: 'a' },
    { id: 'c', parent: 'b' },
    { id: 'd', parent: null },
  ];
  assert.equal(canMoveFolder(folders, 'a', 'c'), false);
  assert.equal(canMoveFolder(folders, 'a', 'a'), false);
  assert.equal(canMoveFolder(folders, 'c', 'd'), true);
  assert.deepEqual([...collectionIds(folders, 'a')], ['a', 'b', 'c']);
});
test('legacy migration preserves authored notes and their original parent folders', () => {
  const values = {
    'still-notes-v1': JSON.stringify([
      { id: 'my-note', title: 'My own words', body: 'Keep me', folder: 'personal' },
    ]),
    'still-folders-v1': JSON.stringify([
      { id: 'personal', name: 'Personal', emoji: '🌿', parent: null },
      { id: 'ideas', name: 'Little ideas', emoji: '💡', parent: null },
    ]),
  };
  const migrated = migrateLegacy({ getItem: (key) => values[key] || null });
  assert.equal(migrated.notes[0].body, 'Keep me');
  assert.deepEqual(
    migrated.folders.map((folder) => folder.id),
    ['personal'],
  );
});
test('legacy migration preserves edited demo IDs and rejects corrupt storage', () => {
  const storage = {
    getItem: (key) =>
      key === 'still-notes-v1'
        ? JSON.stringify([
            {
              id: 'n1',
              title: 'A little room to grow',
              body: 'My replacement writing',
              folder: null,
            },
          ])
        : null,
  };
  assert.equal(migrateLegacy(storage).notes.length, 1);
  assert.throws(() => migrateLegacy({ getItem: () => '{broken' }));
});
test('vault encrypts every field, uses unique IVs, rejects wrong PIN and tampering', async () => {
  const data = {
    ...emptyWorkspace(),
    profile: { name: 'Private name', avatar: '🌙' },
    notes: [{ body: 'Private writing' }],
  };
  const credentials = await createCredentials('928461');
  const envelope = await seal(data, credentials);
  assert.equal(JSON.stringify(envelope).includes('Private'), false);
  assert.equal(JSON.stringify(envelope).includes('928461'), false);
  assert.notEqual((await seal(data, credentials)).iv, envelope.iv);
  assert.deepEqual((await openVault(envelope, '928461')).data, data);
  await assert.rejects(() => openVault(envelope, '000000'));
  await assert.rejects(() =>
    openVault({ ...envelope, ciphertext: 'AAAA' + envelope.ciphertext.slice(4) }, '928461'),
  );
  await assert.rejects(() => createCredentials('1234'));
});

test('workspace validation rejects malformed records and cyclic folders without resetting data', async () => {
  const { validateWorkspace } = await import('../src/lib/vault.js');
  assert.throws(() => validateWorkspace({ ...emptyWorkspace(), notes: [null] }));
  assert.throws(() =>
    validateWorkspace({
      ...emptyWorkspace(),
      folders: [
        { id: 'a', name: 'A', emoji: '📁', parent: 'b' },
        { id: 'b', name: 'B', emoji: '📁', parent: 'a' },
      ],
    }),
  );
  assert.deepEqual(validateWorkspace(emptyWorkspace()), emptyWorkspace());
});

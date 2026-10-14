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

test('sanctuary migration preserves old data and keeps Personal and Work independent', async () => {
  const { normalizeSanctuary, taskSection, taskComplete } = await import('../src/data.js');
  const old = { ...emptyWorkspace(), notes: [{ id: 'owned', body: 'My original writing' }] };
  const migrated = normalizeSanctuary(old);
  assert.equal(migrated.spaces[0].notes[0].body, 'My original writing');
  assert.deepEqual(migrated.spaces[1].notes, []);
  assert.notEqual(migrated.spaces[0].tasks, migrated.spaces[1].tasks);
  assert.equal(taskSection({ due: '2026-10-17' }, '2026-10-15'), 'upcoming');
  assert.equal(taskSection({ repeat: true, due: '' }, '2026-10-15'), 'daily');
  assert.equal(taskSection({ due: '2026-10-14' }, '2026-10-15'), 'today');
  const repeating = { repeat: true, completedDates: ['2026-10-15'] };
  assert.equal(taskComplete(repeating, '2026-10-15'), true);
  assert.equal(taskComplete(repeating, '2026-10-16'), false);
});

test('local recovery never stores the answer, rejects incorrect answers and decrypts the latest vault', async () => {
  const { createLocalRecovery, unlockRecovery } = await import('../src/lib/vault.js');
  const { normalizeSanctuary } = await import('../src/data.js');
  const answer = 'Only I remember the silver river.';
  const recovery = await createLocalRecovery(
    'What private phrase takes me home?',
    answer,
    'A river, not a place',
  );
  assert.equal(JSON.stringify(recovery).includes(answer), false);
  const data = { ...normalizeSanctuary(emptyWorkspace()), recovery };
  const credentials = await createCredentials('831702');
  const envelope = await seal(data, credentials);
  assert.equal(envelope.recovery.question, 'What private phrase takes me home?');
  assert.equal(JSON.stringify(envelope).includes(recovery.key), false);
  assert.equal(JSON.stringify(envelope).includes(answer), false);
  await assert.rejects(() => unlockRecovery(envelope.recovery, 'A completely different answer'));
  assert.deepEqual(await unlockRecovery(envelope.recovery, answer), data);
  data.profile.name = 'Written after configuring recovery';
  const latest = await seal(data, credentials);
  assert.equal((await unlockRecovery(latest.recovery, answer)).profile.name, data.profile.name);
  await assert.rejects(() => createLocalRecovery('Question', 'short', 'hint'));
  await assert.rejects(() =>
    unlockRecovery(
      { ...envelope.recovery, wrappedKey: { ...envelope.recovery.wrappedKey, ciphertext: 'AAAA' } },
      answer,
    ),
  );
});

test('companion jumps follow a parabolic trajectory and clear solid panels', async () => {
  const { jumpPoint, planJump, safePoint } = await import('../src/lib/motion/geometry.js');
  const from = { x: 100, y: 300 },
    to = { x: 600, y: 220 };
  const obstacles = [{ left: 290, right: 410, top: 250, bottom: 550 }];
  const viewport = { width: 800, height: 600 };
  const plan = planJump(from, to, obstacles, viewport);
  assert.ok(plan, 'a safe arc should exist');
  assert.deepEqual(jumpPoint(from, to, plan.height, 0), from);
  assert.deepEqual(jumpPoint(from, to, plan.height, 1), to);
  for (let step = 0; step <= 200; step++)
    assert.ok(safePoint(jumpPoint(from, to, plan.height, step / 200), obstacles, viewport));
  const y0 = jumpPoint(from, to, plan.height, 0.4).y,
    y1 = jumpPoint(from, to, plan.height, 0.5).y,
    y2 = jumpPoint(from, to, plan.height, 0.6).y;
  assert.ok(y2 - 2 * y1 + y0 > 0, 'vertical acceleration should point downward');
});

test('companion rejects clipped perches and impossible routes', async () => {
  const { visibleSurface, planJump } = await import('../src/lib/motion/geometry.js');
  const viewport = { width: 800, height: 600 };
  assert.equal(visibleSurface({ left: 20, right: 70, top: 100, bottom: 130 }, viewport), null);
  assert.equal(visibleSurface({ left: 20, right: 220, top: 25, bottom: 70 }, viewport), null);
  assert.equal(
    visibleSurface({ left: 20, right: 220, top: 120, bottom: 150 }, viewport, {
      left: 0,
      right: 300,
      top: 130,
      bottom: 250,
    }),
    null,
  );
  assert.equal(
    planJump(
      { x: 100, y: 350 },
      { x: 650, y: 350 },
      [{ left: 300, right: 450, top: 0, bottom: 600 }],
      viewport,
    ),
    null,
  );
});

test('companion selects a free part of a partially obstructed ledge', async () => {
  const { findPerch, safePoint } = await import('../src/lib/motion/geometry.js');
  const surface = { left: 80, right: 720, top: 300 };
  const viewport = { width: 800, height: 600 };
  const obstacles = [{ left: 100, right: 440, top: 250, bottom: 400 }];
  const point = findPerch(surface, obstacles, viewport, 0.2);
  assert.ok(point);
  assert.ok(point.x > 440);
  assert.ok(safePoint(point, obstacles, viewport));
});

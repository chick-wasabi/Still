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

test('3D viewport mapping round-trips across desktop and mobile sizes', async () => {
  const { screenToWorld, worldToScreen } = await import('../src/lib/pet3d/math.js');
  for (const view of [
    { width: 1600, height: 1000, unit: 78 },
    { width: 390, height: 844, unit: 64 },
  ]) {
    for (const [x, y] of [
      [0, 0],
      [view.width, view.height],
      [123, 456],
    ]) {
      const p = screenToWorld(x, y, view),
        screen = worldToScreen(p.x, p.y, view);
      assert.ok(Math.abs(screen.x - x) < 1e-9);
      assert.ok(Math.abs(screen.y - y) < 1e-9);
    }
  }
});
test('ballistic launches obey gravity and arrive at higher and lower surfaces', async () => {
  const { launchVelocity, ballisticPoint, GRAVITY } = await import('../src/lib/pet3d/math.js');
  const from = { x: -2, y: 1 };
  for (const to of [
    { x: 3, y: 2 },
    { x: -5, y: -2 },
  ]) {
    const v = launchVelocity(from, to, 1.5),
      end = ballisticPoint(from, v, v.time);
    assert.ok(Math.abs(end.x - to.x) < 1e-9);
    assert.ok(Math.abs(end.y - to.y) < 1e-9);
    const a = ballisticPoint(from, v, 0.2),
      b = ballisticPoint(from, v, 0.3),
      c = ballisticPoint(from, v, 0.4);
    assert.ok(Math.abs(c.y - 2 * b.y + a.y + GRAVITY * 0.01) < 1e-9);
  }
});
test('3D perches and planned leaps reject clipped bodies and solid obstacles', async () => {
  const { perch, planLeap, ballisticPoint, clearBody } = await import('../src/lib/pet3d/math.js');
  const bounds = { width: 18, height: 12 },
    surface = { left: 1, right: 5, top: 0, bottom: -3 };
  const p = perch(surface, [surface], bounds);
  assert.ok(p);
  const from = { x: -3, y: 0.435 },
    velocity = planLeap(from, p, [surface], bounds);
  assert.ok(velocity);
  for (let i = 0; i <= 100; i++)
    assert.ok(
      clearBody(ballisticPoint(from, velocity, (i / 100) * velocity.time), [surface], bounds),
    );
  assert.equal(perch({ left: 1, right: 1.5, top: 6, bottom: 4 }, [], bounds), null);
  const wall = { left: -1, right: 0, top: 6, bottom: -6 };
  assert.equal(planLeap(from, p, [surface, wall], bounds), null);
});
test('throw velocity uses recent real input, clamps speed, and releases a stopped drag gently', async () => {
  const { tossVelocity } = await import('../src/lib/pet3d/math.js');
  assert.deepEqual(tossVelocity([]), { x: 0, y: 0, z: 0 });
  const fast = tossVelocity([
    { x: 0, y: 0, t: 0 },
    { x: 10, y: 10, t: 50 },
  ]);
  assert.ok(Math.abs(Math.hypot(fast.x, fast.y) - 18) < 1e-9);
  assert.deepEqual(
    tossVelocity([
      { x: 0, y: 0, t: 0 },
      { x: 2, y: 3, t: 50 },
      { x: 2, y: 3, t: 250 },
    ]),
    { x: 0, y: 0, z: 0 },
  );
});
test('3D behavior weights respect guards, fatigue, and recent decisions', async () => {
  const { behavior } = await import('../src/lib/pet3d/math.js');
  const sample = (energy) =>
    Array.from({ length: 1000 }, (_, i) =>
      behavior({ energy, previous: 'walk', ball: false, cursor: false }, () => i / 1000),
    );
  for (const forbidden of ['walk', 'hunt', 'stalk']) assert.ok(!sample(1).includes(forbidden));
  assert.ok(
    sample(0.1).filter((x) => x === 'sleep').length >
      sample(1).filter((x) => x === 'sleep').length * 3,
  );
});
test('procedural cat has a bound skeleton, reusable material groups, and distinct skeletal gaits', async () => {
  const { createCatModel } = await import('../src/lib/pet3d/catModel.js');
  const model = createCatModel();
  assert.equal(model.mesh.isSkinnedMesh, true);
  assert.ok(
    Math.abs(model.standingHeight * 40 - 45) < 0.01,
    'standing kitten is calibrated to 45px',
  );
  assert.ok(model.bones.length >= 30);
  assert.ok(
    model.mesh.geometry.groups.length <= 7,
    'parts sharing material should batch into one draw',
  );
  assert.ok(model.mesh.material[0].map?.isDataTexture, 'tabby fur is textured');
  assert.ok(
    model.mesh.material[0].normalMap?.isDataTexture,
    'fine fur has a shared normal texture',
  );
  const weights = model.mesh.geometry.attributes.skinWeight;
  assert.ok(
    Array.from({ length: weights.count }, (_, i) => weights.getY(i)).some((w) => w > 0 && w < 1),
    'limbs and tail blend between bones',
  );
  for (let i = 0; i < weights.count; i++)
    assert.ok(
      Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-7,
    );
  for (let i = 0; i < 60; i++) model.update('walk', 0.23, 1 / 60, 1);
  const walk = model.byName.frontNear.rotation.z;
  for (let i = 0; i < 60; i++) model.update('run', 0.23, 1 / 60, 5);
  assert.ok(Math.abs(walk - model.byName.frontNear.rotation.z) > 0.2);
  for (let i = 0; i < 60; i++) model.update('sleep', 2, 1 / 60);
  assert.equal(model.byName.eyeL.scale.y, 0.08);
  assert.ok(Number.isFinite(model.mouthPosition().x));
  model.dispose();
});
test('Rapier applies gravity, lands a CCD rigid body, and rebounds the physics ball', async () => {
  const R = await import('@dimforge/rapier3d-compat');
  await R.init();
  const world = new R.World({ x: 0, y: -14, z: 0 });
  const floor = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0));
  world.createCollider(R.ColliderDesc.cuboid(5, 0.1, 1), floor);
  const cat = world.createRigidBody(
    R.RigidBodyDesc.dynamic().setTranslation(0, 3, 0).setCcdEnabled(true).lockRotations(),
  );
  world.createCollider(R.ColliderDesc.cuboid(0.57, 0.42, 0.27), cat);
  const ball = world.createRigidBody(
    R.RigidBodyDesc.dynamic().setTranslation(2, 2, 0).setCcdEnabled(true),
  );
  world.createCollider(R.ColliderDesc.ball(0.15).setRestitution(0.8), ball);
  let rebounded = false;
  for (let i = 0; i < 150; i++) {
    world.step();
    if (i > 20 && ball.linvel().y > 2) rebounded = true;
  }
  assert.ok(Math.abs(cat.translation().y - 0.42) < 0.025);
  assert.equal(rebounded, true);
  world.free();
});

test('document coordinates stay stable as content grows and a render window scrolls', async () => {
  const { screenToWorld, worldToScreen, PET_UNIT, clearBody, planLeap } =
    await import('../src/lib/pet3d/math.js');
  const view = { width: 1200, height: 900, unit: PET_UNIT, document: true };
  const point = screenToWorld(550, 420, view);
  assert.deepEqual(screenToWorld(550, 420, { ...view, height: 24000 }), point);
  assert.deepEqual(worldToScreen(point.x, point.y, { ...view, height: 24000 }), { x: 550, y: 420 });
  const bounds = { left: 0, right: 40, top: 0, bottom: -800, width: 40, height: 800 };
  assert.equal(clearBody({ x: 20, y: -700 }, [], bounds), true);
  assert.equal(clearBody({ x: -1, y: -700 }, [], bounds), false);
  assert.equal(
    planLeap({ x: 20, y: -700 }, { x: 20, y: -680 }, [], bounds),
    null,
    'tiny kitten cannot float up a 560px jump',
  );
});

async function petPhysicsFixture(offset = 0, randomizeSpawn = false) {
  const R = await import('@dimforge/rapier3d-compat');
  await R.init();
  const { createDirector } = await import('../src/lib/pet3d/director.js');
  const { createPetInput } = await import('../src/lib/pet3d/state.js');
  const world = new R.World({ x: 0, y: -26, z: 0 });
  const surface = {
    id: 'panel',
    kind: 'calendar',
    left: 15,
    right: 20,
    top: -8 - offset,
    bottom: -12 - offset,
  };
  const panel = world.createRigidBody(
    R.RigidBodyDesc.fixed().setTranslation(17.5, -10 - offset, 0),
  );
  world.createCollider(R.ColliderDesc.cuboid(2.5, 2, 1), panel);
  const floor = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(20, -29 - offset, 0));
  world.createCollider(R.ColliderDesc.cuboid(20, 0.1, 1), floor);
  const cat = world.createRigidBody(
    R.RigidBodyDesc.dynamic().setTranslation(0, 0, 0).setCcdEnabled(true).lockRotations(),
  );
  world.createCollider(R.ColliderDesc.cuboid(0.57, 0.42, 0.27).setFriction(0.8), cat);
  const ball = world.createRigidBody(
    R.RigidBodyDesc.dynamic().setTranslation(1, 0, 0).setCcdEnabled(true),
  );
  world.createCollider(R.ColliderDesc.ball(0.15).setMass(0.12), ball);
  const attributes = new Set();
  const text = {
    textContent: 'Your journal',
    setAttribute: (name) => attributes.add(name),
    removeAttribute: (name) => attributes.delete(name),
  };
  const layout = {
    pageKey: 'journal',
    revision: 'initial',
    bounds: { left: 0, right: 40, top: 0, bottom: -30 - offset, width: 40, height: 30 + offset },
    boxes: [surface],
    surfaces: [surface],
    elementsById: new Map([['panel', text]]),
  };
  const input = createPetInput(),
    modes = [];
  input.ballEnabled = true;
  const ai = createDirector({
    cat,
    ball,
    world,
    rapier: R,
    input,
    layout: () => layout,
    notify: (mode) => modes.push(mode),
    randomizeSpawn,
  });
  ai.initialize();
  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      ai.step(1 / 60);
      world.step();
    }
  }
  step(5);
  return {
    R,
    world,
    cat,
    ball,
    input,
    ai,
    step,
    modes,
    attributes,
    text,
    layout,
    dispose() {
      ai.dispose();
      world.free();
    },
  };
}

test('fetching follows the mouth deep in the document and restores ball physics on release', async () => {
  const f = await petPhysicsFixture(700),
    originalRandom = Math.random;
  try {
    Math.random = () => 0.2;
    const p = f.cat.translation();
    f.ball.setTranslation({ x: p.x + 0.8, y: p.y - 0.25, z: 0 }, true);
    f.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    Object.assign(f.input.mouth, { x: p.x + 0.4, y: p.y + 0.1, z: 0 });
    f.input.ballMoved = true;
    f.step(2);
    assert.equal(f.input.carryingBall, true);
    assert.equal(f.ball.isKinematic(), true);
    f.input.mouth.x += 2;
    f.input.mouth.y += 0.2;
    f.step(5);
    assert.ok(Math.abs(f.ball.translation().x - f.input.mouth.x) < 0.01);
    assert.ok(f.ball.translation().y < -700, 'fetch remains in document space below the viewport');
    f.ai.dropBall();
    assert.equal(f.ball.isDynamic(), true);
    assert.equal(f.ball.collider(0).isEnabled(), true);
    const before = f.ball.translation().y;
    f.step(40);
    assert.ok(f.ball.translation().y < before);
  } finally {
    Math.random = originalRandom;
    f.dispose();
  }
});

test('climbing grips an actual panel sidewall and lands on its top under gravity', async () => {
  const f = await petPhysicsFixture();
  try {
    f.cat.setTranslation({ x: 14.4, y: -10, z: 0 }, true);
    f.cat.setLinvel({ x: 9, y: 0, z: 0 }, true);
    f.input.justTossed = true;
    f.step();
    f.ai.impactWall('panel');
    assert.equal(f.ai.mode, 'climb');
    assert.equal(f.cat.isKinematic(), true);
    for (let i = 0; i < 240 && !f.modes.includes('land'); i++) f.step();
    assert.ok(f.modes.includes('jump'));
    assert.ok(f.modes.includes('land'));
    assert.equal(f.cat.isDynamic(), true);
    assert.ok(Math.abs(f.cat.translation().y - (-8 + 0.42)) < 0.15);
  } finally {
    f.dispose();
  }
});

test('scratching decorates text briefly and heals without modifying its content', async () => {
  const f = await petPhysicsFixture(),
    originalRandom = Math.random;
  try {
    Math.random = () => 0.999;
    f.ball.setTranslation({ x: 30, y: -25, z: 0 }, true);
    for (let i = 0; i < 360 && !f.attributes.has('data-pet-scratched'); i++) f.step();
    assert.ok(f.attributes.has('data-pet-scratched'));
    assert.equal(f.text.textContent, 'Your journal');
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(f.attributes.has('data-pet-scratched'), false);
    assert.equal(f.text.textContent, 'Your journal');
  } finally {
    Math.random = originalRandom;
    f.dispose();
  }
});

test('dragging a CCD toy through the cat cannot impart a kinematic launch impulse', async () => {
  const f = await petPhysicsFixture();
  const { maskToyContacts, restoreToyContacts } = await import('../src/lib/pet3d/toyPhysics.js');
  try {
    const p = f.cat.translation();
    f.ball.setTranslation({ x: p.x + 1.1, y: p.y - 0.27, z: 0 }, true);
    f.ball.setBodyType(f.R.RigidBodyType.KinematicPositionBased, true);
    const groups = maskToyContacts(f.ball);
    for (let i = 0; i < 10; i++) {
      f.ball.setNextKinematicTranslation({ x: p.x + 1.1 - i * 0.3, y: p.y - 0.27 + i * 0.3, z: 0 });
      f.world.step();
      assert.ok(Math.abs(f.cat.linvel().x) < 0.1, 'held toy sweeps must not launch the cat');
    }
    f.ball.setBodyType(f.R.RigidBodyType.Dynamic, true);
    restoreToyContacts(f.ball, groups);
    assert.equal(f.ball.collider(0).collisionGroups(), groups);
    assert.ok(Math.abs(f.cat.translation().x - p.x) < 0.05);
  } finally {
    f.dispose();
  }
});

test('motion preferences default the ball off and preserve each independent toggle', async () => {
  const { readMotionPreferences } = await import('../src/hooks/useMotionPreferences.js');
  const read = (value) => readMotionPreferences({ getItem: () => value });
  assert.deepEqual(read(null), { catEnabled: true, ballEnabled: false });
  assert.deepEqual(read('{"catEnabled":false,"ballEnabled":true}'), {
    catEnabled: false,
    ballEnabled: true,
  });
  assert.deepEqual(read('{"catEnabled":true}'), { catEnabled: true, ballEnabled: false });
  assert.deepEqual(read('corrupt'), { catEnabled: true, ballEnabled: false });
});

test('refresh spawn selection varies both pose and safe physical location', async () => {
  const original = Math.random,
    modes = new Set(),
    positions = new Set();
  try {
    for (const n of [0.01, 0.19, 0.36, 0.52, 0.7, 0.91]) {
      Math.random = () => n;
      const f = await petPhysicsFixture(0, true);
      modes.add(f.input.spawnBehavior);
      positions.add(f.cat.translation().x.toFixed(2));
      f.dispose();
    }
    assert.ok(modes.size >= 5);
    assert.ok(positions.size >= 5);
  } finally {
    Math.random = original;
  }
});

test('turning the toy off removes its body from play while keeping the cat active', async () => {
  const f = await petPhysicsFixture();
  try {
    f.input.ballEnabled = false;
    f.ai.syncActors();
    f.step(30);
    assert.equal(f.ball.isEnabled(), false);
    assert.equal(f.ball.collider(0).collisionGroups(), 0);
    assert.equal(f.cat.isEnabled(), true);
    assert.equal(f.input.carryingBall, false);
  } finally {
    f.dispose();
  }
});

test('a thrown toy earns a bounded play session before ordinary cat behavior resumes', async () => {
  const f = await petPhysicsFixture(),
    original = Math.random;
  try {
    Math.random = () => 0.95;
    f.input.ballMoved = true;
    f.step();
    assert.equal(f.ai.playingBall, true);
    f.step(11 * 60);
    assert.equal(f.ai.playingBall, false);
    assert.equal(f.input.ballEnabled, true, 'finishing play leaves the ball available');
    assert.equal(f.ball.isEnabled(), true);
  } finally {
    Math.random = original;
    f.dispose();
  }
});

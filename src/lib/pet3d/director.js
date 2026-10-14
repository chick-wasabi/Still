import {
  CAT,
  GRAVITY,
  behavior,
  choose,
  clamp,
  length,
  perch,
  planLeap,
  randomRange,
  clearBody,
} from './math';

// Physics owns translation. The director only chooses velocities/impulses and animation states.
export function createDirector({ cat, ball, world, rapier, input, layout, notify }) {
  let time = 0,
    since = 0,
    until = 2,
    mode = 'idle',
    previous = '',
    energy = 1,
    target = null,
    launch = null;
  let grounded = false,
    airborneSince = 0,
    revision = '',
    afterLanding = 'idle',
    speedBefore = 0,
    clingUntil = 0,
    interestUntil = 0;
  let cursorHunt = false,
    disposed = false;
  const fixed = (c) => c.parent()?.isFixed();
  function ray(point, distance = CAT.halfHeight + 0.12) {
    return world.castRay(
      new rapier.Ray({ x: point.x, y: point.y + 0.01, z: 0 }, { x: 0, y: -1, z: 0 }),
      distance,
      true,
      undefined,
      undefined,
      undefined,
      cat,
      fixed,
    );
  }
  function setMode(next, duration = randomRange(2.3, 5.5)) {
    mode = next;
    since = time;
    until = time + duration;
    input.mode = next;
    notify(next);
  }
  function releaseCursor() {
    if (input.held || cursorHunt) input.idleDeadline = performance.now() + randomRange(6000, 8000);
    input.held = false;
    input.grabAt = 0;
    cursorHunt = false;
  }
  function surfaceAt(p) {
    return layout().surfaces.find(
      (s) =>
        Math.abs(p.y - CAT.halfHeight - s.top) < 0.14 &&
        p.x + CAT.halfWidth > s.left &&
        p.x - CAT.halfWidth < s.right,
    );
  }
  function home() {
    const l = layout();
    const ordered = [...l.surfaces].sort((a, b) =>
      a.kind === 'calendar' ? -1 : b.kind === 'calendar' ? 1 : 0,
    );
    for (const s of ordered) {
      const p = perch(s, l.boxes, l.bounds);
      if (p) return p;
    }
    // A safe floor segment is also a real Rapier platform.
    for (let x = 0; x < l.bounds.width / 2; x += 0.7)
      for (const side of [1, -1]) {
        const p = { x: x * side, y: -l.bounds.height / 2 + CAT.halfHeight + 0.1, z: 0 };
        if (clearBody(p, l.boxes, l.bounds)) return p;
      }
    return {
      x: l.bounds.width / 2 - CAT.halfWidth - 0.1,
      y: l.bounds.height / 2 - CAT.halfHeight - 0.2,
      z: 0,
    };
  }
  function reset() {
    cat.setBodyType(rapier.RigidBodyType.Dynamic, true);
    cat.setTranslation(home(), true);
    cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const p = cat.translation();
    ball.setTranslation(
      {
        x: clamp(p.x + 1.1, -layout().bounds.width / 2 + 0.2, layout().bounds.width / 2 - 0.2),
        y: p.y - CAT.halfHeight + 0.17,
        z: 0,
      },
      true,
    );
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    launch = null;
    target = null;
    releaseCursor();
    setMode('idle', randomRange(1, 3));
  }
  function startJump(surface, after = 'idle') {
    const l = layout(),
      dest = surface && perch(surface, l.boxes, l.bounds, Math.random());
    if (!dest) return false;
    const hit = ray(dest, CAT.halfHeight + 0.2);
    if (!hit) return false;
    const velocity = planLeap(cat.translation(), dest, l.boxes, l.bounds);
    if (!velocity) return false;
    target = dest;
    launch = { velocity, after };
    setMode('crouch', randomRange(0.22, 0.4));
    return true;
  }
  function walkTo(x, next = 'walk', duration = 5) {
    const p = cat.translation(),
      l = layout(),
      surface = surfaceAt(p);
    const min = surface
      ? surface.left + CAT.halfWidth + 0.04
      : -l.bounds.width / 2 + CAT.halfWidth + 0.08;
    const max = surface
      ? surface.right - CAT.halfWidth - 0.04
      : l.bounds.width / 2 - CAT.halfWidth - 0.08;
    const dest = { x: clamp(x, min, max), y: p.y, z: 0 };
    // Do not walk off a ledge or into another card/heading.
    for (let i = 0; i <= 20; i++)
      if (!clearBody({ x: p.x + ((dest.x - p.x) * i) / 20, y: p.y }, l.boxes, l.bounds))
        return false;
    target = dest;
    setMode(next, duration);
    return true;
  }
  function stalk() {
    cursorHunt = true;
    const p = cat.translation(),
      pointer = input.worldPointer,
      l = layout();
    const near = [...l.surfaces].sort(
      (a, b) =>
        length({ x: (a.left + a.right) / 2, y: a.top }, pointer) -
        length({ x: (b.left + b.right) / 2, y: b.top }, pointer),
    );
    for (const s of near.slice(0, 5)) {
      if (s === surfaceAt(p)) break;
      if (startJump(s, 'stalk')) return;
    }
    setMode('stalk-ready', randomRange(0.65, 1));
  }
  function decide() {
    if (input.held && time - input.heldAt > 4 && (Math.random() < 0.3 || time - input.heldAt > 20))
      releaseCursor();
    const next =
      time < interestUntil
        ? 'hunt'
        : behavior({ energy, previous, cursor: input.cursorActive && !input.held, ball: true });
    previous = next;
    energy = clamp(energy + (next === 'sleep' ? 0.3 : -0.06), 0, 1);
    if (next === 'jump') {
      const candidates = [...layout().surfaces].sort(() => Math.random() - 0.5).slice(0, 8);
      for (const surface of candidates)
        if (surface !== surfaceAt(cat.translation()) && startJump(surface)) return;
      setMode('stretch', 4);
      return;
    }
    if (next === 'walk' || next === 'run') {
      const p = cat.translation(),
        s = surfaceAt(p),
        l = layout();
      if (walkTo(randomRange(s?.left ?? -l.bounds.width / 2, s?.right ?? l.bounds.width / 2), next))
        return;
      setMode('idle');
      return;
    }
    if (next === 'stalk' && !input.held) {
      setMode('stalk-ready', randomRange(0.8, 1.5));
      cursorHunt = false;
      return;
    }
    setMode(
      next,
      next === 'sleep'
        ? randomRange(6, 13)
        : next === 'roll'
          ? 3.2
          : next === 'stretch'
            ? 4
            : randomRange(2.5, 5),
    );
  }
  function impactWall() {
    if (disposed || input.drag || mode === 'cling' || speedBefore < 5) return;
    releaseCursor();
    cat.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
    clingUntil = time + randomRange(0.55, 1);
    setMode('cling', clingUntil - time);
  }
  function command(action) {
    if (action === 'pet' && grounded) {
      releaseCursor();
      setMode(choose(['roll', 'stretch']), 3.5);
    }
    if (action === 'ball') {
      const p = cat.translation();
      ball.setBodyType(rapier.RigidBodyType.Dynamic, true);
      ball.setTranslation({ x: p.x + (p.x > 0 ? -1 : 1), y: p.y + 1.1, z: 0 }, true);
      ball.setLinvel({ x: p.x > 0 ? -3 : 3, y: 4, z: 0 }, true);
      interestUntil = time + 9;
      releaseCursor();
      setMode('hunt', 7);
    }
    if (action === 'release') releaseCursor();
  }
  function step(dt) {
    if (disposed) return;
    time += dt;
    const l = layout();
    if (revision !== l.revision) {
      revision = l.revision;
      reset();
    }
    if (input.command && (input.command !== 'pet' || grounded)) {
      command(input.command);
      input.command = null;
    }
    const p = cat.translation(),
      v = cat.linvel();
    // Collision events may drain after several fixed steps in a slower render frame.
    // Preserve the recent pre-impact speed instead of replacing it with the solver's stopped velocity.
    speedBefore = Math.max(Math.hypot(v.x, v.y), speedBefore * Math.exp(-dt * 9));
    if (Math.abs(v.x) > 0.2) input.facing = Math.sign(v.x);
    input.catPosition.x = p.x;
    input.catPosition.y = p.y;
    input.ballPosition.x = ball.translation().x;
    input.ballPosition.y = ball.translation().y;
    grounded =
      v.y < 0.7 &&
      [0, -CAT.halfWidth * 0.9, CAT.halfWidth * 0.9].some((dx) =>
        Boolean(ray({ x: p.x + dx, y: p.y })),
      );
    input.grounded = grounded;
    input.speed = v.x;
    input.stateTime = time - since;
    input.time = time;
    if (input.drag?.kind === 'cat') {
      setModeIfDifferent('drag');
      return;
    }
    if (input.justTossed) {
      speedBefore = Math.hypot(v.x, v.y);
      input.justTossed = false;
      airborneSince = time;
      setMode('tossed', 5);
    }
    if (input.ballMoved) {
      input.ballMoved = false;
      interestUntil = time + 10;
      if (grounded) setMode('hunt', 7);
    }
    if (mode === 'cling') {
      if (time >= clingUntil) {
        cat.setBodyType(rapier.RigidBodyType.Dynamic, true);
        cat.setLinvel({ x: p.x > 0 ? -1.8 : 1.8, y: 1.5, z: 0 }, true);
        airborneSince = time;
        setMode('fall', 3);
      }
      return;
    }
    if (p.y < -l.bounds.height / 2 - 2 || Math.abs(p.x) > l.bounds.width / 2 + 2) {
      reset();
      return;
    }
    if (ball.translation().y < -l.bounds.height / 2 - 2) {
      ball.setTranslation({ x: p.x + 1, y: p.y + 0.5, z: 0 }, true);
      ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    if (['jump', 'fall', 'tossed'].includes(mode)) {
      if (grounded && time - airborneSince > 0.12) {
        cat.setLinvel({ x: v.x * 0.15, y: v.y, z: 0 }, true);
        setMode('land', 0.24);
      }
      return;
    }
    if (!grounded && mode !== 'crouch') {
      airborneSince = time;
      setMode('fall', 4);
      return;
    }
    if (mode === 'crouch') {
      if (time >= until && launch) {
        cat.setLinvel({ x: launch.velocity.x, y: launch.velocity.y, z: 0 }, true);
        airborneSince = time;
        const after = launch.after;
        afterLanding = after;
        launch = null;
        setMode('jump', 4);
        if (after === 'stalk') cursorHunt = true;
      }
      return;
    }
    if (mode === 'land' && time >= until) {
      if (cursorHunt) {
        setMode('stalk-ready', 0.5);
      } else if (afterLanding === 'hunt') {
        afterLanding = 'idle';
        setMode('hunt', 5);
      } else decide();
      return;
    }
    const writing = document.activeElement?.matches(
      'input,textarea,select,[contenteditable="true"]',
    );
    if (
      input.cursorActive &&
      !input.held &&
      !writing &&
      !input.pressed &&
      performance.now() > input.idleDeadline &&
      !cursorHunt
    ) {
      stalk();
      return;
    }
    if (mode === 'stalk-ready' && time >= until) {
      if (cursorHunt && input.cursorActive) {
        if (!walkTo(input.worldPointer.x, 'stalk', 4)) {
          setMode('grab', 0.6);
          input.held = true;
          input.heldAt = time;
          input.grabAt = time;
          cursorHunt = false;
        }
      } else decide();
      return;
    }
    if (['walk', 'run', 'stalk', 'carry'].includes(mode)) {
      if (!target || Math.abs(target.x - p.x) < 0.1 || time >= until) {
        cat.setLinvel({ x: 0, y: v.y, z: 0 }, true);
        if (cursorHunt && input.cursorActive) {
          setMode('grab', 0.6);
          input.held = true;
          input.heldAt = time;
          input.grabAt = time;
          cursorHunt = false;
        } else decide();
        return;
      }
      const direction = Math.sign(target.x - p.x),
        speed = mode === 'run' ? 5.7 : mode === 'stalk' ? 3.4 : 1.6;
      cat.setLinvel(
        { x: direction * Math.min(speed, Math.abs(target.x - p.x) * 5), y: v.y, z: 0 },
        true,
      );
      input.facing = direction;
    } else if (mode === 'hunt') {
      const b = ball.translation(),
        dx = b.x - p.x;
      if (Math.hypot(dx, b.y - p.y) < 1.3) {
        ball.applyImpulse({ x: Math.sign(dx || 1) * 0.45, y: 0.35, z: 0 }, true);
        setMode('bat', 0.8);
      } else if (Math.abs(dx) > 0.2) {
        if (!walkTo(b.x, 'run', 3)) {
          const candidates = [...l.surfaces].sort(
            (a, s) =>
              Math.abs((a.left + a.right) / 2 - b.x) - Math.abs((s.left + s.right) / 2 - b.x),
          );
          if (!candidates.some((s) => s !== surfaceAt(p) && startJump(s, 'hunt')))
            setMode('idle', 1.5);
        }
      }
    } else {
      if (Math.abs(v.x) > 0.02) cat.setLinvel({ x: v.x * Math.exp(-dt * 10), y: v.y, z: 0 }, true);
      if (time >= until) decide();
    }
  }
  function setModeIfDifferent(next) {
    if (mode !== next) setMode(next);
  }
  function interrupt() {
    if (cursorHunt || input.held || mode === 'grab') {
      releaseCursor();
      if (!['jump', 'fall', 'tossed'].includes(mode)) setMode('idle', 1);
    }
  }
  return {
    step,
    impactWall,
    command,
    interrupt,
    initialize: reset,
    dispose() {
      disposed = true;
      releaseCursor();
    },
    get mode() {
      return mode;
    },
  };
}

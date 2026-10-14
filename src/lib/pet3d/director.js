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
  worldBounds,
} from './math.js';
import { maskToyContacts, restoreToyContacts } from './toyPhysics.js';

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
    disposed = false,
    previousLayout = null,
    climbing = null,
    toyGroups = ball.collider(0).collisionGroups();
  const pages = new Map(),
    scratches = new Map();
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
  function surfaceAt(p, l = layout()) {
    return l.surfaces.find(
      (s) =>
        Math.abs(p.y - CAT.halfHeight - s.top) < 0.14 &&
        p.x + CAT.halfWidth > s.left &&
        p.x - CAT.halfWidth < s.right,
    );
  }
  function home() {
    const l = layout(),
      edge = worldBounds(l.bounds);
    const ordered = [...l.surfaces].sort((a, b) =>
      a.kind === 'calendar' ? -1 : b.kind === 'calendar' ? 1 : 0,
    );
    for (const s of ordered) {
      const p = perch(s, l.boxes, l.bounds);
      if (p) return p;
    }
    // A safe floor segment is also a real Rapier platform.
    for (let x = edge.left + CAT.halfWidth + 0.1; x < edge.right - CAT.halfWidth; x += 0.7) {
      const p = { x, y: edge.bottom + CAT.halfHeight + 0.1, z: 0 };
      if (clearBody(p, l.boxes, l.bounds)) return p;
    }
    return {
      x: edge.right - CAT.halfWidth - 0.1,
      y: edge.top - CAT.halfHeight - 0.2,
      z: 0,
    };
  }
  function reset() {
    dropBall();
    const l = layout(),
      edge = worldBounds(l.bounds);
    cat.setBodyType(rapier.RigidBodyType.Dynamic, true);
    cat.setTranslation(home(), true);
    cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const p = cat.translation();
    ball.setTranslation(
      {
        x: clamp(p.x + 1.1, edge.left + 0.2, edge.right - 0.2),
        y: p.y - CAT.halfHeight + 0.17,
        z: 0,
      },
      true,
    );
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    launch = null;
    target = null;
    climbing = null;
    releaseCursor();
    setMode('idle', randomRange(1, 3));
    revision = l.revision;
    previousLayout = l;
  }
  function reconcile() {
    const l = layout();
    input.worldRevision = (input.worldRevision || 0) + 1;
    if (previousLayout && previousLayout.pageKey !== l.pageKey) {
      pages.set(previousLayout.pageKey, {
        cat: { ...cat.translation() },
        ball: { ...ball.translation() },
      });
      dropBall();
      const saved = pages.get(l.pageKey);
      if (saved && clearBody(saved.cat, l.boxes, l.bounds)) {
        cat.setBodyType(rapier.RigidBodyType.Dynamic, true);
        cat.setTranslation(saved.cat, true);
        ball.setTranslation(saved.ball, true);
        cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
        target = null;
        launch = null;
        releaseCursor();
        setMode('idle');
      } else reset();
    } else if (previousLayout) {
      // Only actual reflow moves a supporting ledge; scrolling leaves the world untouched.
      for (const [body, half] of [
        [cat, CAT.halfHeight],
        [ball, 0.15],
      ]) {
        const p = body.translation();
        const support = previousLayout.surfaces.find(
          (s) => Math.abs(p.y - half - s.top) < 0.16 && p.x >= s.left && p.x <= s.right,
        );
        const moved = support && l.surfaces.find((s) => s.id === support.id);
        if (moved) {
          const dx = moved.left - support.left,
            dy = moved.top - support.top;
          if (dx || dy) body.setTranslation({ x: p.x + dx, y: p.y + dy, z: 0 }, true);
        }
      }
      if (!clearBody(cat.translation(), l.boxes, l.bounds)) {
        const nearest = [...l.surfaces]
          .sort(
            (a, b) =>
              length({ x: a.left, y: a.top }, cat.translation()) -
              length({ x: b.left, y: b.top }, cat.translation()),
          )
          .map((s) => perch(s, l.boxes, l.bounds))
          .find(Boolean);
        if (nearest) {
          cat.setTranslation(nearest, true);
          cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
    }
    if (climbing) {
      const box = l.boxes.find((b) => b.id === climbing.box.id);
      if (box)
        climbing = {
          ...climbing,
          box,
          x: (climbing.side < 0 ? box.left : box.right) + climbing.side * (CAT.halfWidth + 0.025),
          goal: box.top + CAT.halfHeight + 0.15,
        };
      else {
        climbing = null;
        cat.setBodyType(rapier.RigidBodyType.Dynamic, true);
        airborneSince = time;
        setMode('fall', 3);
      }
    }
    revision = l.revision;
    previousLayout = l;
  }
  function dropBall() {
    if (!input.carryingBall) return;
    input.carryingBall = false;
    ball.setBodyType(rapier.RigidBodyType.Dynamic, true);
    restoreToyContacts(ball, toyGroups);
    ball.setLinvel({ x: input.facing * 1.8, y: 1, z: 0 }, true);
  }
  function startClimb(box) {
    if (!box || box.top - box.bottom < 1 || input.drag || input.held) return false;
    const p = cat.translation();
    const side = p.x < (box.left + box.right) / 2 ? -1 : 1;
    const x = (side < 0 ? box.left : box.right) + side * (CAT.halfWidth + 0.025);
    if (Math.abs(x - p.x) > 0.25 || p.y > box.top || p.y < box.bottom - 0.2) return false;
    const goal = box.top + CAT.halfHeight + 0.15;
    if (
      !Array.from({ length: 12 }, (_, i) => ({ x, y: p.y + ((goal - p.y) * i) / 11 })).every(
        (point) => clearBody(point, layout().boxes, layout().bounds),
      )
    )
      return false;
    climbing = { box, side, x, goal };
    dropBall();
    cat.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
    setMode('climb', Math.min(9, (climbing.goal - p.y) / 2.4 + 0.5));
    return true;
  }
  function scratch() {
    const l = layout(),
      p = cat.translation();
    const surface =
      surfaceAt(p) ||
      [...l.surfaces].sort(
        (a, b) => length({ x: a.left, y: a.top }, p) - length({ x: b.left, y: b.top }, p),
      )[0];
    const element = l.elementsById?.get(surface?.id);
    if (element) {
      clearTimeout(scratches.get(element));
      element.setAttribute('data-pet-scratched', 'true');
      scratches.set(
        element,
        setTimeout(() => {
          element.removeAttribute('data-pet-scratched');
          scratches.delete(element);
        }, 700),
      );
    }
    setMode('scratch', randomRange(1.1, 1.8));
  }
  function startJump(surface, after = 'idle') {
    if (!surface) return false;
    const l = layout(),
      p = cat.translation();
    const fraction = clamp((p.x - surface.left) / (surface.right - surface.left), 0, 1);
    let dest, velocity;
    for (const f of [Math.random(), fraction]) {
      dest = perch(surface, l.boxes, l.bounds, f);
      if (!dest || !ray(dest, CAT.halfHeight + 0.2)) continue;
      velocity = planLeap(p, dest, l.boxes, l.bounds);
      if (velocity) break;
    }
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
    const edge = worldBounds(l.bounds);
    const min = surface ? surface.left + CAT.halfWidth + 0.04 : edge.left + CAT.halfWidth + 0.08;
    const max = surface ? surface.right - CAT.halfWidth - 0.04 : edge.right - CAT.halfWidth - 0.08;
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
    if (input.carryingBall) {
      dropBall();
      setMode('bat', 0.8);
      return;
    }
    if (input.held && time - input.heldAt > 4 && (Math.random() < 0.3 || time - input.heldAt > 20))
      releaseCursor();
    const next =
      time < interestUntil
        ? 'hunt'
        : behavior({
            energy,
            previous,
            cursor: input.cursorActive && !input.held,
            ball: !input.held,
            wall: layout().boxes.some((b) => b.top - b.bottom > 1),
            text: true,
          });
    previous = next;
    energy = clamp(energy + (next === 'sleep' ? 0.3 : -0.06), 0, 1);
    if (next === 'scratch') {
      scratch();
      return;
    }
    if (next === 'climb') {
      if (layout().boxes.some(startClimb)) return;
      scratch();
      return;
    }
    if (next === 'jump') {
      const candidates = [...layout().surfaces].sort(() => Math.random() - 0.5).slice(0, 24);
      for (const surface of candidates)
        if (surface !== surfaceAt(cat.translation()) && startJump(surface)) return;
      setMode('stretch', 4);
      return;
    }
    if (next === 'walk' || next === 'run') {
      const p = cat.translation(),
        s = surfaceAt(p),
        l = layout();
      if (
        walkTo(
          randomRange(
            s?.left ?? worldBounds(l.bounds).left,
            s?.right ?? worldBounds(l.bounds).right,
          ),
          next,
        )
      )
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
  function impactWall(id) {
    if (disposed || input.drag || mode === 'cling' || mode === 'climb' || speedBefore < 5) return;
    if (startClimb(layout().boxes.find((b) => b.id === id))) return;
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
      dropBall();
      const p = cat.translation(),
        edge = worldBounds(layout().bounds),
        direction = p.x > (edge.left + edge.right) / 2 ? -1 : 1;
      ball.setBodyType(rapier.RigidBodyType.Dynamic, true);
      ball.setTranslation({ x: p.x + direction, y: p.y + 1.1, z: 0 }, true);
      ball.setLinvel({ x: direction * 3, y: 4, z: 0 }, true);
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
    if (revision !== l.revision || previousLayout?.pageKey !== l.pageKey) reconcile();
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
    if (input.carryingBall) {
      if (input.drag || input.held) dropBall();
      else ball.setNextKinematicTranslation(input.mouth);
    }
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
    if (mode === 'climb' && climbing) {
      const y = Math.min(climbing.goal, p.y + dt * 2.4);
      cat.setNextKinematicTranslation({ x: climbing.x, y, z: 0 });
      input.facing = -climbing.side;
      if (y >= climbing.goal - 0.02 || time >= until) {
        cat.setBodyType(rapier.RigidBodyType.Dynamic, true);
        const dest = perch(climbing.box, l.boxes, l.bounds, climbing.side < 0 ? 0 : 1);
        if (dest && y >= climbing.goal - 0.02) {
          const velocity = planLeap({ x: climbing.x, y }, dest, l.boxes, l.bounds);
          cat.setLinvel(velocity || { x: -climbing.side * 2, y: 2, z: 0 }, true);
        } else cat.setLinvel({ x: climbing.side * 1.5, y: 1, z: 0 }, true);
        climbing = null;
        airborneSince = time;
        setMode('jump', 3);
      }
      return;
    }
    if (mode === 'cling') {
      if (time >= clingUntil) {
        cat.setBodyType(rapier.RigidBodyType.Dynamic, true);
        const edge = worldBounds(l.bounds);
        cat.setLinvel({ x: p.x > (edge.left + edge.right) / 2 ? -1.8 : 1.8, y: 1.5, z: 0 }, true);
        airborneSince = time;
        setMode('fall', 3);
      }
      return;
    }
    const edge = worldBounds(l.bounds);
    if (p.y < edge.bottom - 2 || p.x < edge.left - 2 || p.x > edge.right + 2) {
      reset();
      return;
    }
    if (ball.translation().y < edge.bottom - 2) {
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
    const writing =
      typeof document !== 'undefined' &&
      document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
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
    if (['walk', 'run', 'stalk', 'carry', 'descend'].includes(mode)) {
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
        speed = mode === 'run' || mode === 'descend' ? 5.7 : mode === 'stalk' ? 3.4 : 1.6;
      cat.setLinvel(
        { x: direction * Math.min(speed, Math.abs(target.x - p.x) * 5), y: v.y, z: 0 },
        true,
      );
      input.facing = direction;
    } else if (mode === 'hunt') {
      const b = ball.translation(),
        dx = b.x - p.x;
      if (Math.hypot(dx, b.y - p.y) < 1.3 && input.drag?.kind !== 'ball') {
        if (!input.held && Math.random() < 0.45) {
          input.carryingBall = true;
          ball.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
          toyGroups = maskToyContacts(ball);
          if (!walkTo(p.x + input.facing * randomRange(2, 5), 'carry', randomRange(2, 4)))
            setMode('carry', 2);
          return;
        }
        ball.applyImpulse({ x: Math.sign(dx || 1) * 0.45, y: 0.35, z: 0 }, true);
        setMode('bat', 0.8);
      } else if (Math.abs(dx) > 0.2) {
        const sameLevel = Math.abs(b.y - p.y) < 0.9;
        if (!sameLevel || !walkTo(b.x, 'run', 3)) {
          const candidates = [...l.surfaces].sort(
            (a, s) =>
              length({ x: clamp(b.x, a.left, a.right), y: a.top }, b) -
              length({ x: clamp(b.x, s.left, s.right), y: s.top }, b),
          );
          if (!candidates.some((s) => s !== surfaceAt(p) && startJump(s, 'hunt'))) {
            if (b.y < p.y - 1 && surfaceAt(p)) {
              const surface = surfaceAt(p),
                side = b.x < p.x ? -1 : 1;
              const edgeX = side < 0 ? surface.left : surface.right;
              if (walkTo(edgeX, 'descend', 12)) {
                target.x = edgeX + side * (CAT.halfWidth + 0.5);
                afterLanding = 'hunt';
              } else setMode('idle', 1.5);
            } else setMode('idle', 1.5);
          }
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
    dropBall,
    interrupt,
    initialize: reset,
    reconcile,
    dispose() {
      disposed = true;
      dropBall();
      for (const [element, timer] of scratches) {
        clearTimeout(timer);
        element.removeAttribute('data-pet-scratched');
      }
      scratches.clear();
      releaseCursor();
    },
    get mode() {
      return mode;
    },
  };
}

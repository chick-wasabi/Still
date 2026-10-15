import {
  CAT,
  GRAVITY,
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
import { createBehaviorBrain } from './brain.js';
import { createTextMischief } from './textMischief.js';
import { findSurfaceRoute, supportAt } from './navigation.js';
import { BEHAVIORS, RESTING, COMFORT, behaviorDuration } from './behaviorConfig.js';

// Physics owns translation. The director only chooses velocities/impulses and animation states.
export function createDirector({
  cat,
  ball,
  world,
  rapier,
  input,
  layout,
  notify,
  randomizeSpawn = true,
}) {
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
    toyGroups = ball.collider(0).collisionGroups(),
    catGroups = cat.collider(0).collisionGroups(),
    catOn,
    ballOn,
    goal = null,
    reactionIndex = 0,
    cursorCooldown = 0,
    ballCooldown = 0,
    bats = 0,
    cursorUntil = 0,
    cursorPlanUntil = 0,
    cursorAim = null,
    pendingBat = null,
    climbSpeed = 0,
    restNext = null,
    lastProgress = null,
    pendingScratch = null;
  const cooldowns = {},
    blockedEdges = new Map(),
    occupancy = {};
  const brain = createBehaviorBrain();
  const recent = [],
    visits = new Map();
  const mischief =
    input.host && typeof document !== 'undefined' ? createTextMischief(input.host, input) : null;
  input.restoreMischief = () => {
    mischief?.restoreLetter();
    mischief?.healScratch();
  };
  const pages = new Map();
  const fixed = (c) =>
    c.parent()?.isFixed() &&
    !c.isSensor() &&
    (!input.dropThrough || c.parent().userData?.id !== input.dropThrough.id);
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
    input.stateTime = 0;
    input.behaviorLabel =
      {
        idle: 'IDLE_BREATH',
        'stalk-ready': 'MOUSE_STALKING',
        stalk: 'MOUSE_STALKING',
        'cursor-pounce': 'MOUSE_POUNCE',
        grab: 'GRAB_CURSOR',
        hunt: 'CHASE_BALL',
        bat: 'BAT_BALL',
        carry: 'FETCH_BALL',
        climb: 'VISUAL_CLIMB',
        'run-away': 'RUN_AWAY',
        guard: 'GUARD_TREASURE',
      }[next] || next.toUpperCase();
    notify(next);
  }
  function say(text) {
    input.bubble = { text, until: time + randomRange(1.5, 2.8) };
  }
  function releaseCursor() {
    if (input.held || cursorHunt) input.idleDeadline = performance.now() + randomRange(6000, 8000);
    if (input.held) cursorCooldown = time + randomRange(18, 32);
    input.held = false;
    input.grabAt = 0;
    input.cursorCapture = null;
    cursorAim = null;
    cursorUntil = 0;
    if (typeof document !== 'undefined')
      document.documentElement.removeAttribute('data-pet-cursor');
    cursorHunt = false;
  }
  function surfaceAt(p, l = layout()) {
    return supportAt(p, l.surfaces);
  }
  function home(randomized = false) {
    const l = layout(),
      edge = worldBounds(l.bounds);
    const origin = input.host?.getBoundingClientRect?.();
    const visible = l.surfaces.filter((surface) => {
      const y = -surface.top * (l.view?.unit || 40) + (origin?.top || 0);
      return !origin || (y > 65 && y < innerHeight - 25);
    });
    const ordered = randomized
      ? [...(visible.length ? visible : l.surfaces)].sort(() => Math.random() - 0.5)
      : [...l.surfaces];
    for (const surface of ordered) {
      const p = perch(surface, l.boxes, l.bounds, randomized ? randomRange(0.1, 0.9) : 0.5);
      if (p) {
        input.spawnSurface = surface.kind;
        visits.set(surface.id, (visits.get(surface.id) || 0) + 1);
        return p;
      }
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
    cat.setTranslation(home(randomizeSpawn), true);
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
    goal = null;
    const initial = randomizeSpawn
      ? choose(['sleep', 'sit', 'stretch', 'groom', 'idle', 'head-tilt'])
      : 'idle';
    setMode(initial, behaviorDuration(initial));
    restNext = null;
    input.spawnBehavior = initial;
    syncActors();
    revision = l.revision;
    previousLayout = l;
  }
  function syncActors() {
    if (catOn !== input.catEnabled) {
      catOn = input.catEnabled;
      cat.setEnabled(catOn);
      cat.collider(0).setCollisionGroups(catOn ? catGroups : 0);
      if (!catOn) {
        releaseCursor();
        input.restoreMischief();
        goal = null;
      }
    }
    if (ballOn !== input.ballEnabled) {
      dropBall();
      ballOn = input.ballEnabled;
      ball.setEnabled(ballOn);
      ball.collider(0).setCollisionGroups(ballOn ? toyGroups : 0);
      if (ballOn) {
        const p = cat.translation();
        const edge = worldBounds(layout().bounds);
        ball.setTranslation(
          {
            x: clamp(p.x + 1.2, edge.left + 0.2, edge.right - 0.2),
            y: Math.min(edge.top - 0.2, (input.viewport?.top ?? edge.top) - 0.2),
            z: 0,
          },
          true,
        );
        interestUntil = time + randomRange(6, 9);
        bats = 0;
        ballCooldown = 0;
        if (catOn && grounded) {
          releaseCursor();
          goal = null;
          setMode('hunt', 7);
        }
        ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
      } else {
        interestUntil = 0;
        input.ballMoved = false;
        if (input.drag?.kind === 'ball') input.cancelDrag?.();
      }
    }
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
      goal = null;
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
          if ((dx || dy) && !support.sticky)
            body.setTranslation({ x: p.x + dx, y: p.y + dy, z: 0 }, true);
        }
      }
      if (
        !clearBody(
          cat.translation(),
          l.boxes.filter((b) => !b.oneWay),
          l.bounds,
        )
      ) {
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
    if (goal?.textTarget) {
      const updated = l.textTargets?.find((t) => t.node === goal.textTarget.node);
      if (updated) {
        goal.textTarget = updated;
        goal.point = updated.point;
        goal.surface = updated.surface || goal.surface;
      } else {
        goal = null;
        input.restoreMischief();
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
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    interestUntil = 0;
    ballCooldown = time + randomRange(12, 25);
  }
  function startClimb(box) {
    if (!box || box.top - box.bottom < 1 || input.drag) return false;
    const p = cat.translation();
    const side = p.x < (box.left + box.right) / 2 ? -1 : 1;
    const x = (side < 0 ? box.left : box.right) + side * (CAT.halfWidth + 0.025);
    if (Math.abs(x - p.x) > 0.75 || p.y > box.top || p.y < box.bottom - 0.2) return false;
    const roof =
      layout().surfaces.find((s) => s.id === box.id.replace(/-(left|right)$/, '')) || box;
    const goal = roof.top + CAT.halfHeight + 0.15;
    if (
      !Array.from({ length: 12 }, (_, i) => ({ x, y: p.y + ((goal - p.y) * i) / 11 })).every(
        (point) => clearBody(point, layout().boxes, layout().bounds),
      )
    )
      return false;
    climbing = { box, roof, side, x, goal };
    climbSpeed = 0.7;
    dropBall();
    cat.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
    setMode('climb', Math.min(60, (climbing.goal - p.y) / 2.4 + 2));
    return true;
  }
  function scratch(targetText = null) {
    const p = cat.translation(),
      l = layout();
    const nearby = (l.textTargets || []).filter(
      (t) => t.node.isConnected && length(t.point, p) < 2.2,
    );
    const text = targetText || nearby.sort((a, b) => length(a.point, p) - length(b.point, p))[0];
    pendingScratch = { target: text, at: time + 0.4, strikes: 0, next: time + 0.4 };
    setMode(text && text.point.y > p.y + 0.2 ? 'scratch-rear' : 'scratch', 2.4);
  }
  function beginActivity(next) {
    cooldowns[next] = time + (BEHAVIORS[next]?.cooldown || 0);
    if (COMFORT.has(next)) {
      const s = surfaceAt(cat.translation());
      if (!s || s.right - s.left < (next === 'roll' || next === 'sploot' ? 3 : 1.8)) {
        setMode('sit', behaviorDuration('sit'));
        return;
      }
      restNext = next === 'sleep' && Math.random() < 0.35 ? 'side-sleep' : next;
      setMode('lie-down', 2.4);
    } else setMode(next, behaviorDuration(next));
  }
  function visit(surface, action = 'explore', textTarget = null) {
    if (!surface) return false;
    goal = {
      surface,
      action,
      textTarget,
      point: textTarget?.point || {
        x:
          action === 'cursor'
            ? clamp(input.worldPointer.x, surface.left, surface.right)
            : clamp(cat.translation().x + randomRange(-4, 4), surface.left, surface.right),
        y: surface.top,
      },
      expires: time + (action === 'cursor' ? 22 : 60),
    };
    return pursueGoal();
  }
  function pursueGoal() {
    if (!goal) return false;
    const l = layout(),
      p = cat.translation(),
      g = goal;
    const updated = l.surfaces.find((s) => s.id === g.surface.id);
    if (updated) g.surface = updated;
    const width = g.surface.right - g.surface.left - 2 * CAT.halfWidth - 0.08;
    const dest = perch(
      g.surface,
      l.boxes,
      l.bounds,
      clamp((g.point.x - g.surface.left - CAT.halfWidth - 0.04) / Math.max(width, 0.01), 0, 1),
    );
    if (!dest || time > g.expires) {
      goal = null;
      setMode('idle', 2);
      return false;
    }
    const current = surfaceAt(p);
    if (current?.id === g.surface.id && Math.abs(p.x - dest.x) < 0.22) {
      goal = null;
      input.navigationRoute = [];
      visits.set(g.surface.id, (visits.get(g.surface.id) || 0) + 1);
      if (g.action === 'cursor') setMode('stalk-ready', randomRange(0.45, 0.8));
      else if (g.action === 'retreat') setMode('guard', randomRange(1, 2));
      else if (g.action === 'hunt') setMode('hunt', 4);
      else if (g.action === 'scratch') scratch(g.textTarget);
      else if (g.action === 'steal-letter') {
        if (mischief?.steal(g.textTarget, Math.random, input.mouth)) {
          setMode('grab-letter', 0.8);
          say('a tiny souvenir');
        } else setMode('head-tilt', 3);
      } else beginActivity(choose(['sit', 'groom', 'idle', 'loaf']));
      return true;
    }
    if (
      current?.id === g.surface.id &&
      walkTo(
        dest.x,
        g.action === 'retreat' ? 'run-away' : g.action === 'cursor' ? 'stalk' : 'visit',
        20,
      )
    )
      return true;
    for (const [key, expires] of blockedEdges) if (time > expires) blockedEdges.delete(key);
    const route = findSurfaceRoute(p, g.surface, l, new Set(blockedEdges.keys()));
    input.navigationRoute =
      route?.map((edge) => ({
        x: edge.point.x,
        y: edge.point.y,
        kind: edge.walk ? 'walk' : 'jump',
      })) || [];
    if (route?.length) {
      const edge = route[0];
      input.currentEdge = edge.key;
      if (edge.walk) return walkTo(edge.point.x, g.action === 'retreat' ? 'run-away' : 'visit', 20);
      target = edge.point;
      launch = {
        velocity: edge.velocity,
        after: 'visit',
        dropId: edge.dropId,
        duration: edge.velocity.time,
      };
      setMode('crouch', randomRange(0.22, 0.4));
      return true;
    }
    // Recovery is a physical route, never a reset or a decorative grooming loop.
    if (l.boxes.filter((b) => b.kind === 'wall').some(startClimb)) return true;
    goal = null;
    setMode('idle', 2);
    input.routeFailures = (input.routeFailures || 0) + 1;
    return false;
  }
  function chooseText(action) {
    const l = layout(),
      origin = input.host?.getBoundingClientRect?.();
    const targets = (l.textTargets || []).filter(
      (t) =>
        t.node.isConnected &&
        (!origin ||
          (-t.point.y * l.view.unit + origin.top > 50 &&
            -t.point.y * l.view.unit + origin.top < innerHeight - 20)),
    );
    for (const text of targets.sort(() => Math.random() - 0.5).slice(0, 12)) {
      const surface =
        text.surface ||
        [...l.surfaces].sort(
          (a, b) =>
            length({ x: clamp(text.point.x, a.left, a.right), y: a.top }, text.point) -
            length({ x: clamp(text.point.x, b.left, b.right), y: b.top }, text.point),
        )[0];
      if (surface && visit(surface, action, text)) return true;
    }
    return false;
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
    setMode(next, Math.min(duration, Math.abs(dest.x - p.x) / (next === 'run' ? 4.5 : 1.6) + 1.5));
    return true;
  }
  function stalk() {
    goal = null;
    cursorHunt = true;
    cursorPlanUntil = time + 24;
    cursorAim = { x: input.worldPointer.x, y: input.worldPointer.y };
    setMode('stalk-ready', randomRange(0.6, 1));
  }
  function cursorPounce() {
    if (!cursorAim || !input.cursorActive) return false;
    const p = cat.translation(),
      l = layout();
    input.facing = Math.sign(cursorAim.x - p.x) || input.facing;
    // Use the current animated mouth offset, mirrored toward the target.
    let duration = 0.55,
      dest,
      velocity,
      dropId = null;
    for (let i = 0; i < 4; i++) {
      const predicted = input.predictPounce?.(duration, input.facing);
      const dx =
        predicted?.x ?? clamp(Math.abs(input.mouth.x - p.x) || 0.8, 0.5, 1.1) * input.facing;
      const dy = predicted?.y ?? clamp(input.mouth.y - p.y || 0.4, 0.15, 0.7);
      dest = { x: cursorAim.x - dx, y: cursorAim.y - dy, z: 0 };
      const support = surfaceAt(p);
      dropId =
        support &&
        dest.y < p.y - 0.6 &&
        dest.x > support.left + CAT.halfWidth &&
        dest.x < support.right - CAT.halfWidth
          ? support.id
          : null;
      velocity = planLeap(
        p,
        dest,
        l.boxes.filter((box) => box.id !== dropId),
        l.bounds,
      );
      if (!velocity) break;
      duration = velocity.time;
    }
    if (velocity) {
      launch = { velocity, after: 'cursor', duration: velocity.time, dropId };
      target = dest;
      setMode('crouch', randomRange(0.22, 0.35));
      return true;
    }
    const near = [...l.surfaces].sort(
      (a, b) =>
        length({ x: clamp(dest.x, a.left, a.right), y: a.top }, dest) -
        length({ x: clamp(dest.x, b.left, b.right), y: b.top }, dest),
    );
    for (const surface of near.slice(0, 8)) {
      if (surface.id === surfaceAt(p)?.id) continue;
      if (visit(surface, 'cursor')) return true;
    }
    if (walkTo(dest.x, 'stalk', 2.5) && Math.abs(target.x - p.x) > 0.15) return true;
    return false;
  }
  function checkCursorContact(mouth) {
    if (
      !cursorHunt ||
      !cursorAim ||
      input.held ||
      !input.cursorActive ||
      !['cursor-pounce', 'stalk', 'stalk-ready'].includes(mode)
    )
      return false;
    const distance = Math.hypot(mouth.x - cursorAim.x, mouth.y - cursorAim.y);
    if (distance > 0.18 || input.paused || input.reduced || input.pressed) return false;
    input.held = true;
    input.heldAt = time;
    input.grabAt = time;
    input.cursorCapture = { ...cursorAim };
    input.captureDistance = distance;
    cursorUntil = time + randomRange(5, 10);
    cursorHunt = false;
    if (typeof document !== 'undefined')
      document.documentElement.setAttribute('data-pet-cursor', 'true');
    setMode('grab', 0.55);
    say('caught you!');
    return true;
  }
  function retreat() {
    const l = layout(),
      p = cat.translation();
    const surfaces = [...l.surfaces]
      .filter(
        (s) =>
          s.id !== surfaceAt(p)?.id &&
          (!input.viewport ||
            (s.top < input.viewport.top - 0.7 && s.top > input.viewport.bottom + 0.5)),
      )
      .sort((a, b) => length({ x: b.left, y: b.top }, p) - length({ x: a.left, y: a.top }, p));
    for (const surface of surfaces.slice(0, 12)) if (visit(surface, 'retreat')) return true;
    const surface = surfaceAt(p);
    if (
      surface &&
      walkTo(
        p.x < (surface.left + surface.right) / 2 ? surface.right : surface.left,
        'run-away',
        randomRange(1.5, 3),
      )
    )
      return true;
    setMode('guard', randomRange(0.8, 1.8));
    return false;
  }
  function context() {
    return {
      energy,
      previous,
      time,
      cooldowns: { ...cooldowns },
      space: (surfaceAt(cat.translation())?.right || 0) - (surfaceAt(cat.translation())?.left || 0),
      recent: [...recent],
      cursor: false,
      ball:
        input.ballEnabled &&
        !input.held &&
        !input.stolenLetter &&
        (time < interestUntil || (time > ballCooldown && Math.random() < 0.08)),
      wall: true,
      text: Boolean(layout().textTargets?.length) && !input.held && !input.carryingBall,
      arousal: input.arousal || 0.5,
      position: { ...cat.translation() },
      visits: Object.fromEntries(visits),
      dice: Math.random(),
    };
  }
  function decide() {
    if (input.carryingBall) {
      dropBall();
      setMode('bat', 0.8);
      return;
    }
    if (input.stolenLetter || input.held) {
      retreat();
      return;
    }
    const snapshot = context();
    const recommendation = brain.take(snapshot);
    const next = time < interestUntil && input.ballEnabled ? 'hunt' : recommendation.next;
    input.brainBackend = brain.backend;
    const nearby = (layout().textTargets || []).filter(
      (t) => length(t.point, cat.translation()) < 7,
    );
    input.attention = nearby.length ? choose(nearby).point : null;
    recent.push(next);
    if (recent.length > 3) recent.shift();
    if (next === 'hunt' && time >= interestUntil) interestUntil = time + randomRange(4, 7);
    previous = next;
    cooldowns[next] = time + (BEHAVIORS[next]?.cooldown || 0);
    if (next === 'scratch' || next === 'steal-letter') {
      if (!chooseText(next)) beginActivity('idle');
      return;
    }
    if (next === 'meow') {
      say(choose(['meow', 'pet me?', 'mrrp', 'just checking in']));
      setMode('meow', randomRange(1.4, 2.3));
      return;
    }
    if (next === 'climb') {
      if (layout().boxes.some(startClimb)) return;
      beginActivity('idle');
      return;
    }
    if (next === 'jump' || next === 'explore') {
      const candidates = [...layout().surfaces]
        .filter((s) => s.id !== surfaceAt(cat.translation())?.id)
        .map((s) => ({ s, score: Math.random() / (1 + (visits.get(s.id) || 0) * 2) }))
        .sort((a, b) => b.score - a.score);
      const ranked = recommendation.routes
        .map((id) => candidates.find((t) => t.s.id === id))
        .filter(Boolean);
      for (const { s } of [...ranked, ...candidates].slice(0, 16)) if (visit(s)) return;
      beginActivity('idle');
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
    beginActivity(next);
  }

  function impactWall(id) {
    if (disposed || input.drag || mode === 'cling' || mode === 'climb' || speedBefore < 5) return;
    if (startClimb(layout().boxes.find((b) => b.id === id))) return;
    if (!input.held) releaseCursor();
    cat.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    cat.setLinvel({ x: 0, y: 0, z: 0 }, true);
    clingUntil = time + randomRange(0.55, 1);
    setMode('cling', clingUntil - time);
  }
  function command(action) {
    if (action === 'nap') {
      input.wasDebug = false;
      releaseCursor();
      goal = null;
      beginActivity('sleep');
      return;
    }
    if (action === 'pet' && grounded) {
      releaseCursor();
      goal = null;
      mischief?.restoreLetter();
      const reaction = ['purr', 'bat', 'head-tilt', 'hop'][reactionIndex++ % 4];
      input.reactionCount = reactionIndex;
      say({ purr: 'purrr', bat: 'gotcha!', 'head-tilt': 'pet me?', hop: 'mrrp!' }[reaction]);
      if (reaction === 'hop') {
        const p = cat.translation(),
          dest = { x: p.x, y: p.y, z: 0 };
        const velocity = planLeap(p, dest, layout().boxes, layout().bounds);
        if (velocity) {
          cat.setLinvel(velocity, true);
          airborneSince = time;
          setMode('jump', 2);
        } else setMode('head-tilt', 1.5);
      } else setMode(reaction, randomRange(1.5, 2.5));
    }
    if (action === 'ball' && input.ballEnabled) {
      dropBall();
      const p = cat.translation(),
        edge = worldBounds(layout().bounds),
        direction = p.x > (edge.left + edge.right) / 2 ? -1 : 1;
      ball.setBodyType(rapier.RigidBodyType.Dynamic, true);
      ball.setTranslation({ x: p.x + direction, y: p.y + 1.1, z: 0 }, true);
      ball.setLinvel({ x: direction * 3, y: 4, z: 0 }, true);
      interestUntil = time + randomRange(5, 8);
      bats = 0;
      ballCooldown = 0;
      releaseCursor();
      setMode('hunt', 7);
    }
    if (action === 'release') releaseCursor();
  }
  function step(dt) {
    if (disposed) return;
    time += dt;
    syncActors();
    const l = layout();
    if (revision !== l.revision || previousLayout?.pageKey !== l.pageKey) reconcile();
    if (input.command && (input.command !== 'pet' || grounded)) {
      command(input.command);
      input.command = null;
    }
    if (!input.catEnabled) {
      input.time = time;
      input.stateTime = 0;
      return;
    }
    const p = cat.translation(),
      v = cat.linvel();
    energy = clamp(
      energy +
        dt *
          (mode === 'sleep' || mode === 'side-sleep' ? 0.012 : RESTING.has(mode) ? 0.001 : -0.004),
      0,
      1,
    );
    const family = BEHAVIORS[mode]?.family || (RESTING.has(mode) ? 'rest' : 'transition');
    occupancy[family] = (occupancy[family] || 0) + dt;
    input.occupancy = occupancy;
    input.energy = energy;
    input.intention = family;
    if (
      input.dropThrough &&
      (time > input.dropThrough.until || p.y + CAT.halfHeight < input.dropThrough.top - 0.12)
    )
      input.dropThrough = null;
    const excitement =
      time < interestUntil || cursorHunt
        ? 1
        : ['sleep', 'side-sleep', 'loaf', 'sploot', 'groom', 'sit'].includes(mode)
          ? 0.15
          : 0.5;
    input.arousal =
      (input.arousal ?? 0.5) + (excitement - (input.arousal ?? 0.5)) * Math.min(1, dt * 0.8);
    if (time - (input.brainSampleAt || -1) > 0.6) {
      input.brainSampleAt = time;
      brain.observe(context(), l, time);
      input.brainBackend = brain.backend;
    }
    if (input.held && time >= cursorUntil) {
      releaseCursor();
      say('all yours');
    }
    if (cursorHunt && time >= cursorPlanUntil) {
      releaseCursor();
      goal = null;
    }
    if (pendingBat && time >= pendingBat.at) {
      const toy = ball.translation();
      if (input.ballEnabled && input.drag?.kind !== 'ball' && length(toy, pendingBat.point) < 0.8)
        ball.applyImpulse({ x: pendingBat.direction * 0.2, y: 0.09, z: 0 }, true);
      pendingBat = null;
    }

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
    const supported = grounded ? surfaceAt(p) : null;
    input.support = supported
      ? {
          id: supported.id,
          top: supported.top,
          normal: { x: 0, y: 1 },
          left: supported.left,
          right: supported.right,
        }
      : null;
    input.speed = v.x;
    input.stateTime = time - since;
    input.time = time;
    if (input.debugDestination) {
      const dest = l.surfaces.find((s) => s.id === input.debugDestination);
      input.debugDestination = null;
      input.wasDebug = false;
      if (dest) visit(dest);
    }
    if (input.debugPose && input.debugPose !== 'auto') {
      if (mode !== input.debugPose) setMode(input.debugPose, Infinity);
      input.wasDebug = true;
      const support = surfaceAt(p),
        moving = ['walk', 'run'].includes(mode);
      let vx = moving ? (mode === 'run' ? 4 : 1.6) * input.facing : 0;
      if (
        support &&
        (p.x > support.right - CAT.halfWidth - 0.15 || p.x < support.left + CAT.halfWidth + 0.15)
      ) {
        input.facing = -input.facing;
        vx = -vx;
      }
      cat.setLinvel({ x: vx, y: v.y, z: 0 }, true);
      return;
    } else if (input.wasDebug) {
      input.wasDebug = false;
      setMode('idle', 1);
    }
    if (input.carryingBall) {
      if (input.drag || input.held) dropBall();
      else {
        const blend = clamp((time - (input.ballGrabAt || 0)) / 0.35, 0, 1),
          from = input.ballGrabFrom || input.mouth;
        ball.setNextKinematicTranslation({
          x: from.x + (input.mouth.x - from.x) * blend,
          y: from.y + (input.mouth.y - from.y) * blend,
          z: 0,
        });
      }
    }
    if (input.drag?.kind === 'cat') {
      goal = null;
      restNext = null;
      lastProgress = null;
      setModeIfDifferent('drag');
      return;
    }
    if (input.justTossed) {
      speedBefore = Math.hypot(v.x, v.y);
      input.justTossed = false;
      airborneSince = time;
      setMode('tossed', 5);
    }
    if (input.ballMoved && input.ballEnabled) {
      goal = null;
      mischief?.restoreLetter();
      releaseCursor();
      input.ballMoved = false;
      interestUntil = time + randomRange(5, 8);
      bats = 0;
      ballCooldown = 0;
      if (grounded) setMode('hunt', 7);
    }
    if (interestUntil && time >= interestUntil) {
      interestUntil = 0;
      ballCooldown = time + randomRange(12, 25);
      if (mode === 'hunt') {
        setMode('groom', 2);
        return;
      }
    }
    if (
      input.viewport &&
      v.y < -1 &&
      p.y < input.viewport.bottom + 0.6 &&
      p.y > input.viewport.bottom - 1.2 &&
      performance.now() - (input.viewport.scrollAt || 0) > 700 &&
      !input.drag
    ) {
      const walls = l.boxes
        .filter(
          (b) =>
            b.kind === 'wall' &&
            b.top > p.y &&
            b.bottom < p.y &&
            Math.min(
              Math.abs(p.x - CAT.halfWidth - b.right),
              Math.abs(p.x + CAT.halfWidth - b.left),
            ) < 0.8,
        )
        .sort((a, b) => b.top - a.top);
      if (walls.some(startClimb)) {
        input.scrambles = (input.scrambles || 0) + 1;
        say('up we go');
      }
    }
    if (mode === 'climb' && climbing) {
      // Grip impulses work against scaled gravity; the body stays on the wall.
      const grip = Math.max(0, Math.sin((time - since) * 12));
      climbSpeed = clamp(climbSpeed + (12 * grip - GRAVITY * 0.12) * dt, 0.7, 3.4);
      const y = Math.min(climbing.goal, p.y + dt * climbSpeed);
      cat.setNextKinematicTranslation({
        x: p.x + (climbing.x - p.x) * (1 - Math.exp(-dt * 18)),
        y,
        z: 0,
      });
      input.facing = -climbing.side;
      if (y >= climbing.goal - 0.02 || time >= until) {
        cat.setBodyType(rapier.RigidBodyType.Dynamic, true);
        const dest = perch(
          climbing.roof || climbing.box,
          l.boxes,
          l.bounds,
          climbing.side < 0 ? 0 : 1,
        );
        if (dest && y >= climbing.goal - 0.02) {
          const velocity = planLeap({ x: climbing.x, y }, dest, l.boxes, l.bounds);
          cat.setLinvel(velocity || { x: -climbing.side * 2, y: 2, z: 0 }, true);
        } else cat.setLinvel({ x: -climbing.side * 1.5, y: 1, z: 0 }, true);
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
    if (['jump', 'fall', 'tossed', 'cursor-pounce'].includes(mode)) {
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
        if (launch.dropId)
          input.dropThrough = {
            id: launch.dropId,
            until: time + launch.duration + 1,
            top: l.boxes.find((b) => b.id === launch.dropId)?.top,
          };
        const after = launch.after;
        afterLanding = after;
        launch = null;
        setMode(after === 'cursor' ? 'cursor-pounce' : 'jump', 4);
        if (after === 'stalk') cursorHunt = true;
      }
      return;
    }
    if (mode === 'land' && time >= until) {
      if (cursorHunt) {
        goal = null;
        setMode('stalk-ready', 0.4);
        return;
      }
      if (goal) {
        pursueGoal();
        return;
      }
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
      time >= interestUntil &&
      time > cursorCooldown &&
      !input.carryingBall &&
      !input.stolenLetter &&
      !input.held &&
      !writing &&
      !input.pressed &&
      performance.now() > input.idleDeadline &&
      !cursorHunt &&
      !RESTING.has(mode) &&
      !['groom', 'knead', 'roll', 'stretch', 'scratch', 'scratch-rear'].includes(mode)
    ) {
      // Inactivity is an opportunity, not a repeated command to abandon rest.
      input.idleDeadline = performance.now() + randomRange(12000, 22000);
      if (Math.random() < 0.45) stalk();
      return;
    }
    if (mode === 'stalk-ready' && time >= until) {
      if (cursorHunt && input.cursorActive) {
        if (!cursorPounce()) {
          releaseCursor();
          setMode('head-tilt', 1);
        }
      } else decide();
      return;
    }
    if (mode === 'grab-letter' && time >= until) {
      retreat();
      return;
    }
    if (['walk', 'run', 'stalk', 'carry', 'descend', 'visit', 'run-away'].includes(mode)) {
      if (!target || Math.abs(target.x - p.x) < 0.1 || time >= until) {
        cat.setLinvel({ x: 0, y: v.y, z: 0 }, true);
        if (goal) {
          pursueGoal();
          return;
        }
        if (cursorHunt && input.cursorActive) {
          if (!cursorPounce()) {
            releaseCursor();
            setMode('head-tilt', 1);
          }
        } else if (input.ballEnabled && time < interestUntil) setMode('hunt', 1);
        else decide();
        return;
      }
      const direction = Math.sign(target.x - p.x),
        speed = ['run', 'descend', 'run-away'].includes(mode) ? 5.7 : mode === 'stalk' ? 3.4 : 1.6;
      const wanted = direction * Math.min(speed, Math.max(0.65, Math.abs(target.x - p.x) * 4));
      cat.setLinvel({ x: v.x + clamp(wanted - v.x, -dt * 40, dt * 40), y: v.y, z: 0 }, true);
      if (!lastProgress || lastProgress.mode !== mode || length(p, lastProgress.point) > 0.12)
        lastProgress = { point: { ...p }, at: time, mode };
      else if (time - lastProgress.at > 1.8) {
        if (input.currentEdge) blockedEdges.set(input.currentEdge, time + 15);
        lastProgress = null;
        input.stuckRecoveries = (input.stuckRecoveries || 0) + 1;
        cat.setLinvel({ x: 0, y: v.y, z: 0 }, true);
        if (goal) pursueGoal();
        else decide();
        return;
      }
      input.facing = direction;
    } else if (mode === 'hunt') {
      if (!input.ballEnabled || time > interestUntil) {
        setMode('groom', 2);
        return;
      }

      const b = ball.translation(),
        dx = b.x - p.x;
      const paws = input.paws || [{ x: p.x + input.facing * 0.55, y: p.y - 0.3 }];
      if (paws.some((paw, i) => i < 2 && length(paw, b) < 0.28) && input.drag?.kind !== 'ball') {
        if (!input.held && Math.random() < 0.45) {
          input.carryingBall = true;
          input.ballGrabAt = time;
          input.ballGrabFrom = { ...b };
          ball.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
          toyGroups = maskToyContacts(ball);
          if (
            !walkTo(
              input.pointer.inside
                ? input.worldPointer.x
                : (worldBounds(l.bounds).left + worldBounds(l.bounds).right) / 2,
              'carry',
              randomRange(2, 4),
            )
          )
            setMode('carry', 2);
          return;
        }
        input.strikeSide = bats % 2;
        pendingBat = { at: time + 0.22, direction: Math.sign(dx || input.facing), point: { ...b } };
        if (++bats >= 2) {
          interestUntil = 0;
          ballCooldown = time + randomRange(15, 30);
        }
        setMode('bat', 0.8);
      } else if (Math.abs(dx) > 0.2) {
        const sameLevel = Math.abs(b.y - p.y) < 0.9;
        if (!sameLevel || !walkTo(b.x - Math.sign(dx) * 0.55, 'run', 3)) {
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
              } else if (!visit(candidates[0], 'hunt')) setMode('idle', 1.5);
            } else setMode('idle', 1.5);
          }
        }
      }
    } else {
      if (Math.abs(v.x) > 0.02) cat.setLinvel({ x: v.x * Math.exp(-dt * 10), y: v.y, z: 0 }, true);
      if (
        pendingScratch &&
        ['scratch', 'scratch-rear'].includes(mode) &&
        time >= pendingScratch.next &&
        pendingScratch.strikes < 3
      ) {
        const paw = input.paws?.[pendingScratch.strikes % 2];
        if (paw) mischief?.scratch(pendingScratch.target, paw);
        pendingScratch.strikes++;
        pendingScratch.next = time + 0.5;
      }
      if (time >= until) {
        if (mode === 'lie-down' && restNext) {
          const next = restNext;
          restNext = null;
          setMode(next, next === 'side-sleep' ? behaviorDuration('sleep') : behaviorDuration(next));
          if (['sleep', 'side-sleep'].includes(next) && Math.random() < 0.4) say('purr…');
        } else if (COMFORT.has(mode) || mode === 'side-sleep') {
          if (['loaf', 'knead', 'sploot'].includes(mode) && energy < 0.6 && Math.random() < 0.45)
            setMode('sleep', behaviorDuration('sleep'));
          else setMode('get-up', 2.4);
        } else if (mode === 'get-up') {
          if (Math.random() < 0.35) beginActivity('stretch');
          else decide();
        } else if (goal) pursueGoal();
        else decide();
      }
    }
  }
  function setModeIfDifferent(next) {
    if (mode !== next) setMode(next);
  }
  function interrupt() {
    mischief?.restoreLetter();
    if (cursorHunt || input.held || mode === 'grab') {
      releaseCursor();
      if (!['jump', 'fall', 'tossed', 'cursor-pounce'].includes(mode)) setMode('idle', 1);
    }
  }
  return {
    step,
    impactWall,
    checkCursorContact,
    command,
    dropBall,
    interrupt,
    initialize: reset,
    reconcile,
    syncActors,
    dispose() {
      disposed = true;
      brain.dispose();
      mischief?.dispose();
      input.restoreMischief = null;
      input.bubble = null;
      pendingScratch = null;
      dropBall();
      releaseCursor();
    },
    get playingBall() {
      return input.ballEnabled && time < interestUntil;
    },
    get mode() {
      return mode;
    },
  };
}

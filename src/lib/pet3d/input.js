import { Plane, Vector2, Vector3, Raycaster } from 'three';
import { CAT, clamp, clearBody, screenToWorld, worldToScreen, tossVelocity } from './math';

import { restoreNativeCursor } from './state';

export function bindPetInput({
  input,
  camera,
  catMesh,
  ballMesh,
  cat,
  ball,
  rapier,
  director,
  layout,
  invalidate,
  cursor,
}) {
  const raycaster = new Raycaster(),
    ndc = new Vector2(),
    plane = new Plane(new Vector3(0, 0, 1), 0),
    point = new Vector3();
  let swallowed = false;
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  function interactive() {
    return input.ready && !input.paused && !input.reduced && !document.hidden;
  }
  function usable() {
    return interactive() && fine.matches;
  }
  function activity() {
    director.interrupt();
    input.idleDeadline = performance.now() + 6000 + Math.random() * 2000;
  }
  function updatePointer(event) {
    const view = layout().view;
    input.pointer.x = event.clientX;
    input.pointer.y = event.clientY;
    input.pointer.inside = true;
    Object.assign(input.worldPointer, screenToWorld(event.clientX, event.clientY, view));
    input.cursorType = event.target.closest?.('input,textarea,[contenteditable="true"]')
      ? 'text'
      : event.target.closest?.('button,a,[role="button"]')
        ? 'link'
        : 'arrow';
    if (usable() && event.pointerType !== 'touch') {
      input.cursorActive = true;
      document.documentElement.setAttribute('data-pet-cursor', 'true');
    } else restoreNativeCursor(input, !interactive());
    if (!input.held) cursor.current?.position.set(input.worldPointer.x, input.worldPointer.y, 5);
  }
  function cast(event) {
    ndc.set((event.clientX / innerWidth) * 2 - 1, 1 - (event.clientY / innerHeight) * 2);
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(plane, point);
    return point;
  }
  function move(event) {
    activity();
    updatePointer(event);
    if (!input.drag) return;
    const p = cast(event),
      drag = input.drag,
      l = layout(),
      hw = drag.kind === 'cat' ? CAT.halfWidth : 0.15,
      hh = drag.kind === 'cat' ? CAT.halfHeight : 0.15;
    let x = clamp(
        p.x + drag.offset.x,
        -l.bounds.width / 2 + hw + 0.04,
        l.bounds.width / 2 - hw - 0.04,
      ),
      y = clamp(
        p.y + drag.offset.y,
        -l.bounds.height / 2 + hh + 0.12,
        l.bounds.height / 2 - hh - 0.06,
      );
    // Keep a held actor outside solid panels before returning it to dynamic physics.
    for (const b of l.boxes)
      if (x + hw > b.left && x - hw < b.right && y + hh > b.bottom && y - hh < b.top) {
        const candidates = [
          { x, y: b.top + hh + 0.025 },
          { x: b.left - hw - 0.025, y },
          { x: b.right + hw + 0.025, y },
        ].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
        const safe = candidates.find((q) => drag.kind !== 'cat' || clearBody(q, l.boxes, l.bounds));
        if (safe) {
          x = safe.x;
          y = safe.y;
        }
      }
    drag.body.setNextKinematicTranslation({ x, y, z: 0 });
    drag.samples.push({ x, y, t: performance.now() });
    if (drag.samples.length > 16) drag.samples.shift();
    invalidate();
  }
  function down(event) {
    if (input.drag) return;
    activity();
    input.pressed = true;
    updatePointer(event);
    if (
      !interactive() ||
      event.button !== 0 ||
      event.target.closest?.('.pet3d-controls,.pet3d-unavailable')
    )
      return;
    cast(event);
    const view = layout().view,
      c = cat.translation(),
      b = ball.translation();
    const catScreen = worldToScreen(c.x, c.y, view),
      ballScreen = worldToScreen(b.x, b.y, view),
      pickables = [];
    if (
      Math.abs(event.clientX - catScreen.x) < view.unit * 1.2 &&
      Math.abs(event.clientY - catScreen.y) < view.unit * 1.5
    ) {
      catMesh.updateMatrixWorld(true);
      catMesh.computeBoundingSphere();
      pickables.push(catMesh);
    }
    if (Math.hypot(event.clientX - ballScreen.x, event.clientY - ballScreen.y) < view.unit * 0.22) {
      ballMesh.updateMatrixWorld(true);
      pickables.push(ballMesh);
    }
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return;
    const kind = hits[0].object === catMesh ? 'cat' : 'ball',
      body = kind === 'cat' ? cat : ball,
      p = body.translation();
    input.drag = {
      kind,
      body,
      offset: { x: p.x - point.x, y: p.y - point.y },
      samples: [{ x: p.x, y: p.y, t: performance.now() }],
      start: { x: event.clientX, y: event.clientY },
      capture: event.target,
      id: event.pointerId,
    };
    if (kind === 'ball') input.ballMoved = true;
    body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    event.target.setPointerCapture?.(event.pointerId);
    swallowed = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function release(event, cancelled = false) {
    if (input.drag && event.pointerId !== undefined && event.pointerId !== input.drag.id) return;
    input.pressed = false;
    activity();
    const drag = input.drag;
    if (!drag) return;
    drag.body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    const last = drag.samples.at(-1);
    if (last && performance.now() - last.t > 110)
      drag.samples.push({ ...last, t: performance.now() });
    const velocity = cancelled ? { x: 0, y: 0, z: 0 } : tossVelocity(drag.samples);
    drag.body.setLinvel(velocity, true);
    input.lastTossSpeed = Math.hypot(velocity.x, velocity.y);
    if (drag.kind === 'ball') drag.body.setAngvel({ x: 0, y: 0, z: -velocity.x * 2 }, true);
    if (drag.kind === 'cat') {
      if (!cancelled && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 5)
        input.command = 'pet';
      input.justTossed = true;
    } else input.ballMoved = true;
    drag.capture.releasePointerCapture?.(drag.id);
    input.drag = null;
    invalidate();
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }
  function click(event) {
    if (swallowed && event.detail) {
      swallowed = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function leave() {
    if (input.drag) release({}, true);
    input.pointer.inside = false;
    input.pressed = false;
    activity();
    restoreNativeCursor(input);
    invalidate();
  }
  function key() {
    if (input.drag) release({}, true);
    activity();
    invalidate();
  }
  input.cancelDrag = () => release({}, true);
  function touch(event) {
    restoreNativeCursor(input, false);
    // Only an actual mesh pick consumes a gesture; ordinary workspace scrolling stays native.
    if (input.drag && event.cancelable) event.preventDefault();
  }
  const listeners = [
    [document, 'pointermove', move, { passive: true, capture: true }],
    [document, 'pointerdown', down, { capture: true }],
    [document, 'pointerup', release, { capture: true }],
    [document, 'pointercancel', (e) => release(e, true), { capture: true }],
    [document, 'click', click, { capture: true }],
    [document, 'keydown', key, { capture: true }],
    [document, 'wheel', key, { passive: true, capture: true }],
    [document, 'touchstart', touch, { passive: false, capture: true }],
    [document, 'touchmove', touch, { passive: false, capture: true }],
    [document.documentElement, 'pointerleave', leave],
    [window, 'blur', leave],
    [document, 'visibilitychange', leave],
  ];
  for (const [target, event, handler, options] of listeners)
    target.addEventListener(event, handler, options);
  return () => {
    leave();
    input.cancelDrag = null;
    for (const [target, event, handler, options] of listeners)
      target.removeEventListener(event, handler, options);
  };
}

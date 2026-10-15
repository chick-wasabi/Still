import { Plane, Vector2, Vector3, Raycaster } from 'three';
import {
  CAT,
  clamp,
  clearBody,
  screenToWorld,
  worldToScreen,
  tossVelocity,
  worldBounds,
} from './math';

import { restoreNativeCursor } from './state';
import { maskToyContacts, restoreToyContacts } from './toyPhysics';

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
    return interactive() && input.catEnabled && fine.matches && input.pointer.inside;
  }
  function localPoint(event) {
    const rect = input.host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function activity() {
    director.interrupt();
    input.idleDeadline = performance.now() + 6000 + Math.random() * 2000;
  }
  function updatePointer(event) {
    const view = layout().view;
    input.pointer.x = event.clientX;
    input.pointer.y = event.clientY;
    const local = localPoint(event);
    input.pointer.inside =
      local.x >= 0 && local.x <= view.width && local.y >= 0 && local.y <= view.height;
    Object.assign(input.worldPointer, screenToWorld(local.x, local.y, view));
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
    const local = localPoint(event),
      raster = input.raster;
    ndc.set((local.x / raster.width) * 2 - 1, 1 - ((local.y - raster.top) / raster.height) * 2);
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
      hh = drag.kind === 'cat' ? CAT.halfHeight : 0.15,
      edge = worldBounds(l.bounds);
    let x = clamp(p.x + drag.offset.x, edge.left + hw + 0.04, edge.right - hw - 0.04),
      y = clamp(p.y + drag.offset.y, edge.bottom + hh + 0.12, edge.top - hh - 0.06);
    // Keep a held actor outside solid panels before returning it to dynamic physics.
    for (const b of l.boxes)
      if (x + hw > b.left && x - hw < b.right && y + hh > b.bottom && y - hh < b.top) {
        const candidates = [
          { x, y: b.top + hh + 0.025 },
          { x, y: b.bottom - hh - 0.025 },
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
      !input.pointer.inside ||
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
      pickables = [],
      local = localPoint(event);
    if (
      input.catEnabled &&
      Math.abs(local.x - catScreen.x) < view.unit * 3 &&
      Math.abs(local.y - catScreen.y) < view.unit * 2.5
    ) {
      catMesh.updateMatrixWorld(true);
      catMesh.traverse((part) => {
        if (part.isSkinnedMesh) part.computeBoundingSphere();
      });
      pickables.push(catMesh);
    }
    if (
      input.ballEnabled &&
      Math.hypot(local.x - ballScreen.x, local.y - ballScreen.y) < view.unit * 0.22
    ) {
      ballMesh.updateMatrixWorld(true);
      pickables.push(ballMesh);
    }
    let hits = raycaster.intersectObjects(pickables, true);
    // A few CSS pixels of real-mesh pick slop make a tiny pet touchable. There
    // is no invisible full-body rectangle intercepting nearby HTML controls.
    if (!hits.length && input.catEnabled && pickables.includes(catMesh)) {
      const slop = event.pointerType === 'touch' ? 7 : 3;
      for (const [dx, dy] of [
        [-slop, 0],
        [slop, 0],
        [0, -slop],
        [0, slop],
      ]) {
        const raster = input.raster;
        ndc.set(
          ((local.x + dx) / raster.width) * 2 - 1,
          1 - ((local.y + dy - raster.top) / raster.height) * 2,
        );
        raycaster.setFromCamera(ndc, camera);
        hits = raycaster.intersectObject(catMesh, true);
        if (hits.length) break;
      }
    }
    if (!hits.length) return;
    const kind = hits[0].object === ballMesh ? 'ball' : 'cat',
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
    if (kind === 'ball') {
      director.dropBall();
      input.ballMoved = true;
      input.drag.collisionGroups = maskToyContacts(body);
    }
    if (kind === 'cat') input.drag.collisionGroups = maskToyContacts(body);
    body.enableCcd(false);
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
    drag.body.enableCcd(true);
    restoreToyContacts(drag.body, drag.collisionGroups);
    if (drag.kind === 'ball') {
      const position = drag.samples.at(-1);
      drag.body.setTranslation({ x: position.x, y: position.y, z: 0 }, true);
      restoreToyContacts(drag.body, drag.collisionGroups);
    }
    const last = drag.samples.at(-1);
    if (last && performance.now() - last.t > 110)
      drag.samples.push({ ...last, t: performance.now() });
    const velocity = cancelled ? { x: 0, y: 0, z: 0 } : tossVelocity(drag.samples);
    drag.body.setLinvel(velocity, true);
    input.lastTossSpeed = Math.hypot(velocity.x, velocity.y);
    if (drag.kind === 'ball') drag.body.setAngvel({ x: 0, y: 0, z: -velocity.x * 2 }, true);
    if (drag.kind === 'cat') {
      const clicked =
        !cancelled && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 5;
      if (clicked) input.command = 'pet';
      input.justTossed = !clicked;
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
  function scroll() {
    if (!input.pointer.inside || input.held) return;
    // Keep the unheld visual at the real pointer while the document moves beneath it.
    const local = localPoint({ clientX: input.pointer.x, clientY: input.pointer.y });
    const view = layout().view;
    Object.assign(input.worldPointer, screenToWorld(local.x, local.y, view));
    if (local.x < 0 || local.x > view.width || local.y < 0 || local.y > view.height)
      restoreNativeCursor(input);
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
    [document, 'scroll', scroll, { passive: true, capture: true }],
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

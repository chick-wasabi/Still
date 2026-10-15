import { CAT, clamp, length, perch, planLeap } from './math.js';

const graphCaches = new WeakMap();

// Bounded A*: routes may move away from the goal to find a usable stair/perch.
// Every edge uses the same body extents and one-way semantics as Rapier.
export function findSurfaceRoute(from, destination, layout, blocked = new Set()) {
  let cache = graphCaches.get(layout);
  if (!cache) {
    cache = new Map();
    graphCaches.set(layout, cache);
  }
  const surfaces = layout.surfaces.filter((s) => !s.sticky || !layout.scrolling);
  const nodes = [];
  for (const surface of surfaces) {
    const fractions = surface.right - surface.left > 5 ? [0.03, 0.5, 0.97] : [0.5];
    for (const f of fractions) {
      const p = perch(surface, layout.boxes, layout.bounds, f);
      if (p) nodes.push({ p, surface, key: surface.id + ':' + f });
    }
  }
  const start = {
    p: from,
    key: 'start',
    surface: surfaces.find(
      (s) =>
        Math.abs(from.y - CAT.halfHeight - s.top) < 0.15 && from.x >= s.left && from.x <= s.right,
    ),
  };
  const goalPoint = {
    x: clamp(from.x, destination.left, destination.right),
    y: destination.top + CAT.halfHeight,
  };
  const open = [{ node: start, g: 0, f: length(from, goalPoint) / 6, path: [] }],
    best = new Map();
  let expanded = 0;
  while (open.length && expanded++ < 90) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift(),
      a = current.node;
    if (a.surface?.id === destination.id && a.key !== 'start') return current.path;
    const neighbours = nodes
      .filter(
        (b) =>
          b.key !== a.key &&
          Math.abs(b.p.x - a.p.x) <= 16 &&
          b.p.y - a.p.y <= 6 &&
          a.p.y - b.p.y <= 9,
      )
      .sort((a, b) => length(a.p, goalPoint) - length(b.p, goalPoint))
      .slice(0, 28);
    for (const b of neighbours) {
      const edge = a.key + '>' + b.key;
      if (blocked.has(edge)) continue;
      const same = a.surface?.id === b.surface.id;
      const dropId = !same && b.p.y < a.p.y - 0.4 && a.surface?.oneWay ? a.surface.id : null;
      let velocity = null;
      if (!same) {
        if (a.key !== 'start' && cache.has(edge)) velocity = cache.get(edge);
        else {
          velocity = planLeap(
            a.p,
            b.p,
            layout.boxes.filter((box) => box.id !== dropId),
            layout.bounds,
          );
          if (a.key !== 'start') cache.set(edge, velocity);
        }
      }
      if (!same && !velocity) continue;
      const cost = current.g + (same ? length(a.p, b.p) / 1.6 : velocity.time + 0.4);
      if (cost >= (best.get(b.key) ?? Infinity)) continue;
      best.set(b.key, cost);
      open.push({
        node: b,
        g: cost,
        f: cost + length(b.p, goalPoint) / 6,
        path: [
          ...current.path,
          { surface: b.surface, point: b.p, velocity, dropId, key: edge, walk: same },
        ],
      });
    }
  }
  return null;
}

export function supportAt(position, surfaces, tolerance = 0.13) {
  return (
    surfaces
      .filter(
        (s) =>
          Math.abs(position.y - CAT.halfHeight - s.top) < tolerance &&
          position.x >= s.left - 0.02 &&
          position.x <= s.right + 0.02,
      )
      .sort(
        (a, b) =>
          Math.abs(position.y - CAT.halfHeight - a.top) -
          Math.abs(position.y - CAT.halfHeight - b.top),
      )[0] || null
  );
}

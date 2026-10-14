import { distance, findPerch, planJump, safePoint } from './geometry.js';

export const between = (min, max, random = Math.random) => min + (max - min) * random();
export const pick = (items, random = Math.random) => items[Math.floor(random() * items.length)];

// Environment guards are evaluated at each decision, rather than a scheduled sequence.
export function chooseBehavior(
  { energy, previous, wide, collections, buttons, near },
  random = Math.random,
) {
  const choices = [
    ['idle', 1.2],
    ['wander', 3.8],
    ['sleeping', energy < 0.35 ? 5 : 0.8],
    ['stretching', 1.4],
    ['rolling', 0.9],
    ['playing', wide ? 1.5 : 0],
    ['scratching', collections ? 2 : 0],
    ['batting', buttons ? 2 : 0],
    ['stalking', near ? 3 : 1.4],
    ['climbing', collections ? 0.7 : 0],
  ].filter(([name, weight]) => weight > 0 && name !== previous);
  let ticket = random() * choices.reduce((total, [, weight]) => total + weight, 0);
  return choices.find(([, weight]) => (ticket -= weight) < 0)?.[0] || 'idle';
}

function canWalk(from, to, obstacles, viewport) {
  if (Math.abs(from.y - to.y) > 0.5) return false;
  const steps = Math.max(2, Math.ceil(distance(from, to) / 6));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / steps,
    y: from.y,
  })).every((point) => safePoint(point, obstacles, viewport));
}

// Small breadth-first surface graph: only safe walks and collision-tested ballistic edges.
// Computed on decisions/layout invalidation, never in the animation loop.
export function surfaceRoute(
  from,
  attached,
  target,
  surfaces,
  obstacles,
  viewport,
  preferred = 0.5,
  edges = new Map(),
) {
  const point = findPerch(target, obstacles, viewport, preferred);
  if (!point) return null;
  const nodes = [
    { point: from, surface: attached },
    { point, surface: target },
  ];
  const nearby = [...surfaces]
    .sort(
      (a, b) =>
        Math.min(Math.abs(a.left - from.x), Math.abs(a.left - point.x)) -
        Math.min(Math.abs(b.left - from.x), Math.abs(b.left - point.x)),
    )
    .slice(0, 12);
  if (attached && !nearby.includes(attached)) nearby.push(attached);
  if (!nearby.includes(target)) nearby.push(target);
  for (const surface of nearby) {
    for (const fraction of [0, 1]) {
      const point = findPerch(surface, obstacles, viewport, fraction);
      if (point) nodes.push({ point, surface });
    }
  }
  const queue = [{ index: 0, route: [] }],
    visited = new Set([0]);
  while (queue.length) {
    const { index, route } = queue.shift();
    if (route.length >= 6) continue;
    const source = nodes[index];
    for (let next = 1; next < nodes.length; next++) {
      if (visited.has(next)) continue;
      const destination = nodes[next];
      const walk =
        source.surface &&
        (source.surface === destination.surface ||
          (source.surface.element && source.surface.element === destination.surface.element)) &&
        canWalk(source.point, destination.point, obstacles, viewport);
      const key = `${source.point.x},${source.point.y}:${destination.point.x},${destination.point.y}`;
      let arc = null;
      if (!walk) {
        if (!edges.has(key)) {
          if (edges.size >= 2048) edges.delete(edges.keys().next().value);
          edges.set(key, planJump(source.point, destination.point, obstacles, viewport));
        }
        arc = edges.get(key);
      }
      if (!walk && !arc) continue;
      const step = { ...destination, arc };
      const path = [...route, step];
      if (next === 1) return path;
      visited.add(next);
      queue.push({ index: next, route: path });
    }
  }
  return null;
}

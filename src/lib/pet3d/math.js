export const GRAVITY = 26;
export const PET_UNIT = 40;
export const KITTEN_HEIGHT = 45;
export const BALL_RADIUS = 0.15;
export const CAT = Object.freeze({ halfWidth: 0.57, halfHeight: 0.42, depth: 0.27 });
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const randomRange = (min, max, random = Math.random) => min + random() * (max - min);
export const choose = (items, random = Math.random) => items[Math.floor(random() * items.length)];
export const length = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function screenToWorld(x, y, view) {
  return view.document
    ? { x: x / view.unit, y: -y / view.unit, z: 0 }
    : { x: (x - view.width / 2) / view.unit, y: (view.height / 2 - y) / view.unit, z: 0 };
}
export function worldToScreen(x, y, view) {
  return view.document
    ? { x: x * view.unit, y: -y * view.unit }
    : { x: x * view.unit + view.width / 2, y: view.height / 2 - y * view.unit };
}
export function launchVelocity(from, to, rise = 1, gravity = GRAVITY) {
  const apex = Math.max(rise, to.y - from.y + 0.35);
  const vy = Math.sqrt(2 * gravity * apex);
  const time = (vy + Math.sqrt(Math.max(0, vy * vy - 2 * gravity * (to.y - from.y)))) / gravity;
  return { x: (to.x - from.x) / time, y: vy, z: 0, time };
}
export function ballisticPoint(from, velocity, t, gravity = GRAVITY) {
  return { x: from.x + velocity.x * t, y: from.y + velocity.y * t - (gravity * t * t) / 2 };
}
export function worldBounds(bounds) {
  return {
    left: bounds.left ?? -bounds.width / 2,
    right: bounds.right ?? bounds.width / 2,
    top: bounds.top ?? bounds.height / 2,
    bottom: bounds.bottom ?? -bounds.height / 2,
  };
}
export function clearBody(point, boxes, bounds) {
  const edge = worldBounds(bounds);
  if (
    point.x - CAT.halfWidth < edge.left ||
    point.x + CAT.halfWidth > edge.right ||
    point.y + CAT.halfHeight > edge.top ||
    point.y - CAT.halfHeight < edge.bottom + 0.06
  )
    return false;
  return !boxes.some(
    (b) =>
      point.x + CAT.halfWidth > b.left + 0.015 &&
      point.x - CAT.halfWidth < b.right - 0.015 &&
      point.y + CAT.halfHeight > b.bottom + 0.015 &&
      point.y - CAT.halfHeight < b.top - 0.015,
  );
}
export function perch(surface, boxes, bounds, fraction = 0.5) {
  if (surface.right - surface.left < CAT.halfWidth * 2 + 0.08) return null;
  for (const f of [fraction, 0.5, 0.15, 0.85, 0, 1]) {
    const p = {
      x:
        surface.left +
        CAT.halfWidth +
        0.04 +
        Math.max(0, surface.right - surface.left - CAT.halfWidth * 2 - 0.08) * f,
      y: surface.top + CAT.halfHeight + 0.015,
      z: 0,
    };
    if (clearBody(p, boxes, bounds)) return p;
  }
  return null;
}
export function planLeap(from, to, boxes, bounds) {
  if (Math.abs(to.x - from.x) > 16 || to.y - from.y > 6 || from.y - to.y > 9) return null;
  const local = boxes.filter(
    (b) =>
      b.right > Math.min(from.x, to.x) - CAT.halfWidth &&
      b.left < Math.max(from.x, to.x) + CAT.halfWidth &&
      b.top > Math.min(from.y, to.y) - CAT.halfHeight &&
      b.bottom < Math.max(from.y, to.y) + 7 + CAT.halfHeight,
  );
  const point = { x: 0, y: 0 };
  for (
    let rise = Math.max(0.45, to.y - from.y + 0.3);
    rise < Math.min(bounds.height, 7);
    rise += 0.22
  ) {
    const velocity = launchVelocity(from, to, rise);
    if (Math.abs(velocity.x) > 13) continue;
    const count = Math.max(35, Math.ceil(velocity.time * 90));
    let safe = true;
    for (let i = 0; i <= count; i++) {
      const t = (i / count) * velocity.time;
      point.x = from.x + velocity.x * t;
      point.y = from.y + velocity.y * t - (GRAVITY * t * t) / 2;
      if (!clearBody(point, local, bounds)) {
        safe = false;
        break;
      }
    }
    if (safe) return velocity;
  }
  return null;
}
export function tossVelocity(samples, maximum = 18) {
  if (samples.length < 2) return { x: 0, y: 0, z: 0 };
  const last = samples.at(-1);
  const first = samples.find((p) => last.t - p.t <= 110) || last;
  const dt = Math.max(0.016, (last.t - first.t) / 1000);
  let x = (last.x - first.x) / dt,
    y = (last.y - first.y) / dt;
  const magnitude = Math.hypot(x, y);
  if (magnitude > maximum) {
    x *= maximum / magnitude;
    y *= maximum / magnitude;
  }
  return { x, y, z: 0 };
}
export function behavior(
  {
    energy = 1,
    previous = '',
    cursor = false,
    ball = true,
    wall = false,
    text = false,
    recent = [],
  },
  random = Math.random,
) {
  const weights = [
    ['idle', 1.4],
    ['walk', 2],
    ['explore', 4],
    ['sit', 1.2],
    ['groom', 1.5],
    ['meow', 1.2],
    ['run', 1.8],
    ['stretch', 1.5],
    ['roll', 1.2],
    ['sleep', energy < 0.35 ? 5 : 0.8],
    ['jump', 1.7],
    ['hunt', ball ? 2.8 : 0],
    ['stalk', cursor ? 2 : 0],
    ['climb', wall ? 1.3 : 0],
    ['scratch', text ? 1.6 : 0],
    ['steal-letter', text ? 1.2 : 0],
  ];
  const available = weights
    .filter(([name, weight]) => weight && name !== previous)
    .map(([name, w]) => [name, recent.includes(name) ? w * 0.18 : w]);
  let n = random() * available.reduce((sum, [, w]) => sum + w, 0);
  return available.find(([, w]) => (n -= w) < 0)?.[0] || 'idle';
}

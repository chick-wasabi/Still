export const GRAVITY = 14;
export const CAT = Object.freeze({ halfWidth: 0.57, halfHeight: 0.42, depth: 0.27 });
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const randomRange = (min, max, random = Math.random) => min + random() * (max - min);
export const choose = (items, random = Math.random) => items[Math.floor(random() * items.length)];
export const length = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function screenToWorld(x, y, view) {
  return { x: (x - view.width / 2) / view.unit, y: (view.height / 2 - y) / view.unit, z: 0 };
}
export function worldToScreen(x, y, view) {
  return { x: x * view.unit + view.width / 2, y: view.height / 2 - y * view.unit };
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
export function clearBody(point, boxes, bounds) {
  if (
    Math.abs(point.x) + CAT.halfWidth > bounds.width / 2 ||
    point.y + CAT.halfHeight > bounds.height / 2 ||
    point.y - CAT.halfHeight < -bounds.height / 2 + 0.06
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
  for (let rise = Math.max(0.45, to.y - from.y + 0.3); rise < bounds.height; rise += 0.22) {
    const velocity = launchVelocity(from, to, rise);
    if (Math.abs(velocity.x) > 13) continue;
    const samples = Math.max(35, Math.ceil(velocity.time * 90));
    if (
      Array.from({ length: samples + 1 }, (_, i) =>
        ballisticPoint(from, velocity, (i / samples) * velocity.time),
      ).every((p) => clearBody(p, boxes, bounds))
    )
      return velocity;
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
  { energy = 1, previous = '', cursor = false, ball = true },
  random = Math.random,
) {
  const weights = [
    ['idle', 1.4],
    ['walk', 3.3],
    ['run', 1.8],
    ['stretch', 1.5],
    ['roll', 1.2],
    ['sleep', energy < 0.35 ? 5 : 0.8],
    ['jump', 1.7],
    ['hunt', ball ? 2.8 : 0],
    ['stalk', cursor ? 2 : 0],
  ];
  const available = weights.filter(([name, weight]) => weight && name !== previous);
  let n = random() * available.reduce((sum, [, w]) => sum + w, 0);
  return available.find(([, w]) => (n -= w) < 0)?.[0] || 'idle';
}

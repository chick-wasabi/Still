// All coordinates describe the cat's feet in viewport space.
export const CAT = Object.freeze({ width: 68, height: 56, margin: 8 });
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export function surfacePoint(surface, fraction = 0.5) {
  return {
    x:
      surface.left +
      CAT.width / 2 +
      CAT.margin +
      Math.max(0, surface.right - surface.left - CAT.width - CAT.margin * 2) * fraction,
    y: surface.top,
  };
}

export function jumpPoint(from, to, height, t) {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t - 4 * height * t * (1 - t),
  };
}

export function safePoint(point, obstacles, viewport) {
  const left = point.x - CAT.width / 2,
    right = point.x + CAT.width / 2,
    top = point.y - CAT.height;
  if (
    left < CAT.margin ||
    right > viewport.width - CAT.margin ||
    top < CAT.margin ||
    point.y > viewport.height - CAT.margin
  )
    return false;
  return !obstacles.some(
    (rect) =>
      right > rect.left + 1 &&
      left < rect.right - 1 &&
      point.y > rect.top + 1 &&
      top < rect.bottom - 1,
  );
}

export function planJump(from, to, obstacles, viewport) {
  // The arc uses a fixed horizontal velocity and constant vertical acceleration.
  // Reject trajectories that cut through a panel or leave the viewport.
  const base = Math.max(24, Math.abs(to.y - from.y) * 0.2, distance(from, to) * 0.12);
  for (let height = base; height <= viewport.height; height += 12) {
    let safe = true;
    const steps = Math.max(48, Math.ceil(distance(from, to) / 8));
    for (let i = 0; i <= steps; i++)
      if (!safePoint(jumpPoint(from, to, height, i / steps), obstacles, viewport)) {
        safe = false;
        break;
      }
    if (safe)
      return {
        from,
        to,
        height,
        duration: clamp(Math.sqrt((8 * height) / 1100), 0.5, 1.7) + Math.abs(to.x - from.x) / 800,
      };
  }
  return null;
}

export function visibleSurface(rect, viewport, clip) {
  const left = Math.max(rect.left, CAT.margin, clip?.left ?? 0),
    right = Math.min(rect.right, viewport.width - CAT.margin, clip?.right ?? viewport.width);
  const top = rect.top;
  if (
    right - left < CAT.width + CAT.margin * 2 ||
    top < CAT.height + CAT.margin + 2 ||
    top > viewport.height - CAT.margin
  )
    return null;
  if (clip && (top < clip.top || rect.bottom > clip.bottom)) return null;
  return { left, right, top, bottom: rect.bottom };
}

export function findPerch(surface, obstacles, viewport, preferred = 0.5) {
  for (const fraction of [preferred, 0.5, 0.15, 0.85, 0, 1]) {
    const point = surfacePoint(surface, fraction);
    if (safePoint(point, obstacles, viewport)) return point;
  }
  return null;
}

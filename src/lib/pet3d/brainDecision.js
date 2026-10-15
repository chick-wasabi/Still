import { behavior, length, perch, planLeap } from './math.js';

// Pure numeric arbitration also runs when module workers are unavailable.
// No journal text, DOM nodes, or storage data crosses the worker boundary.
export function evaluateFelineDecision(context, geometry = null) {
  const next = behavior(context, () => context.dice ?? Math.random());
  const routes = [];
  if (geometry && context.position && ['jump', 'explore', 'climb'].includes(next)) {
    for (const surface of [...geometry.surfaces]
      .filter(
        (s) =>
          Math.abs((s.left + s.right) / 2 - context.position.x) < 18 &&
          Math.abs(s.top - context.position.y) < 10,
      )
      .sort(
        (a, b) =>
          length({ x: a.left, y: a.top }, context.position) -
          length({ x: b.left, y: b.top }, context.position),
      )
      .slice(0, 32)) {
      const dest = perch(surface, geometry.boxes, geometry.bounds, context.dice);
      if (!dest || length(dest, context.position) < 0.6) continue;
      if (planLeap(context.position, dest, geometry.boxes, geometry.bounds))
        routes.push({
          id: surface.id,
          score: length(dest, context.position) + (context.visits?.[surface.id] || 0) * 4,
        });
    }
    routes.sort((a, b) => a.score - b.score);
  }
  return {
    next,
    previous: context.previous,
    ball: context.ball,
    text: context.text,
    routes: routes.slice(0, 12).map((r) => r.id),
  };
}
